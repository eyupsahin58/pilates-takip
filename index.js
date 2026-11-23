const express = require('express');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));    

const UYELIK_TURLERI = ['normal', 'multisport', 'deneme'];
const DURUMLAR = ['kayitli', 'geldi', 'gelmedi', 'iptal'];
const TARIH_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAAT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------- Yardımcılar ----------

class IsKuraliHatasi extends Error {
  constructor(kod, mesaj) {
    super(mesaj);
    this.kod = kod;
  }
}

function hataYonet(res, e) {
  if (e instanceof IsKuraliHatasi) {
    return res.status(e.kod).json({ hata: e.message });
  }
  console.error(e);
  res.status(500).json({ hata: 'Sunucu hatası.' });
}

function bugun() {
  return new Date().toISOString().slice(0, 10);
}

// Bir oturumdaki dolu yer sayısı (iptal edilenler sayılmaz)
function doluSayisi(oturumId, haricKatilimId = null) {
  return db
    .prepare(
      `SELECT COUNT(*) AS sayi FROM katilim
       WHERE oturum_id = ? AND durum != 'iptal' AND id != ?`
    )
    .get(oturumId, haricKatilimId ?? -1).sayi;
}

// ---------- Genel ----------


// ---------- Müşteriler ----------

app.get('/musteriler', (req, res) => {
  const musteriler = db
    .prepare(
      `SELECT m.id, m.ad, m.telefon, m.uyelik_turu, m.not_metni,
              COALESCE(SUM(p.kalan_seans), 0) AS kalan_seans
       FROM musteri m
       LEFT JOIN paket p ON p.musteri_id = m.id
       GROUP BY m.id
       ORDER BY m.ad`
    )
    .all();
  res.json(musteriler);
});

app.post('/musteriler', (req, res) => {
  const { ad, telefon, not_metni, uyelik_turu = 'normal' } = req.body;
  if (!ad || !ad.trim()) {
    return res.status(400).json({ hata: 'Ad zorunludur.' });
  }
  if (!UYELIK_TURLERI.includes(uyelik_turu)) {
    return res
      .status(400)
      .json({ hata: 'uyelik_turu normal, multisport veya deneme olmalı.' });
  }

  const ekle = db.transaction(() => {
    const sonuc = db
      .prepare(
        'INSERT INTO musteri (ad, telefon, uyelik_turu, not_metni) VALUES (?, ?, ?, ?)'
      )
      .run(ad.trim(), telefon || null, uyelik_turu, not_metni || null);
    if (uyelik_turu === 'deneme') {
      db.prepare(
        'INSERT INTO paket (musteri_id, toplam_seans, kalan_seans, baslangic_tarihi) VALUES (?, 1, 1, ?)'
      ).run(sonuc.lastInsertRowid, bugun());
    }
    return sonuc.lastInsertRowid;
  });

  const id = ekle();
  res.status(201).json({ id, ad: ad.trim(), uyelik_turu });
});

app.delete('/musteriler/:id', (req, res) => {
  const id = Number(req.params.id);
  const sil = db.transaction(() => {
    db.prepare('DELETE FROM katilim WHERE musteri_id = ?').run(id);
    db.prepare('DELETE FROM paket WHERE musteri_id = ?').run(id);
    return db.prepare('DELETE FROM musteri WHERE id = ?').run(id);
  });
  const sonuc = sil();
  if (sonuc.changes === 0) {
    return res.status(404).json({ hata: 'Müşteri bulunamadı.' });
  }
  res.json({ mesaj: 'Müşteri silindi.' });
});

// ---------- Paketler ----------

app.post('/musteriler/:id/paketler', (req, res) => {
  const musteriId = Number(req.params.id);
  const { toplam_seans, baslangic_tarihi } = req.body;

  const musteri = db
    .prepare('SELECT id, uyelik_turu FROM musteri WHERE id = ?')
    .get(musteriId);
  if (!musteri) {
    return res.status(404).json({ hata: 'Müşteri bulunamadı.' });
  }
  if (musteri.uyelik_turu === 'multisport') {
    return res
      .status(400)
      .json({ hata: 'Multisport üyeleri için paket tanımlanmaz.' });
  }
  if (!Number.isInteger(toplam_seans) || toplam_seans <= 0) {
    return res
      .status(400)
      .json({ hata: 'toplam_seans pozitif bir tam sayı olmalı.' });
  }
  const tarih = baslangic_tarihi || bugun();
  if (!TARIH_RE.test(tarih)) {
    return res
      .status(400)
      .json({ hata: 'baslangic_tarihi YYYY-AA-GG biçiminde olmalı.' });
  }

  const sonuc = db
    .prepare(
      'INSERT INTO paket (musteri_id, toplam_seans, kalan_seans, baslangic_tarihi) VALUES (?, ?, ?, ?)'
    )
    .run(musteriId, toplam_seans, toplam_seans, tarih);
  res.status(201).json({ id: sonuc.lastInsertRowid, kalan_seans: toplam_seans });
});

// ---------- Ders oturumları ----------

app.post('/oturumlar', (req, res) => {
  const { tarih, saat, kontenjan = 5, not_metni } = req.body;
  if (!TARIH_RE.test(tarih || '')) {
    return res.status(400).json({ hata: 'tarih YYYY-AA-GG biçiminde olmalı.' });
  }
  if (!SAAT_RE.test(saat || '')) {
    return res.status(400).json({ hata: 'saat SS:DD biçiminde olmalı.' });
  }
  if (!Number.isInteger(kontenjan) || kontenjan < 1) {
    return res.status(400).json({ hata: 'kontenjan pozitif bir tam sayı olmalı.' });
  }

  const sonuc = db
    .prepare(
      'INSERT INTO ders_oturumu (tarih, saat, kontenjan, not_metni) VALUES (?, ?, ?, ?)'
    )
    .run(tarih, saat, kontenjan, not_metni || null);
  res.status(201).json({ id: sonuc.lastInsertRowid, tarih, saat, kontenjan });
});

// Opsiyonel filtre: /oturumlar?baslangic=2026-11-23&bitis=2026-11-29
app.get('/oturumlar', (req, res) => {
  const { baslangic, bitis } = req.query;
  const oturumlar = db
    .prepare(
      `SELECT o.id, o.tarih, o.saat, o.kontenjan, o.not_metni,
              COUNT(CASE WHEN k.durum != 'iptal' THEN 1 END) AS dolu
       FROM ders_oturumu o
       LEFT JOIN katilim k ON k.oturum_id = o.id
       WHERE (@baslangic IS NULL OR o.tarih >= @baslangic)
         AND (@bitis IS NULL OR o.tarih <= @bitis)
       GROUP BY o.id
       ORDER BY o.tarih, o.saat`
    )
    .all({ baslangic: baslangic || null, bitis: bitis || null });
  res.json(oturumlar);
});

app.get('/oturumlar/:id', (req, res) => {
  const id = Number(req.params.id);
  const oturum = db.prepare('SELECT * FROM ders_oturumu WHERE id = ?').get(id);
  if (!oturum) {
    return res.status(404).json({ hata: 'Ders oturumu bulunamadı.' });
  }
  const katilimcilar = db
    .prepare(
      `SELECT k.id AS katilim_id, k.durum, m.id AS musteri_id, m.ad, m.uyelik_turu
       FROM katilim k
       JOIN musteri m ON m.id = k.musteri_id
       WHERE k.oturum_id = ?
       ORDER BY m.ad`
    )
    .all(id);
  const dolu = katilimcilar.filter((k) => k.durum !== 'iptal').length;
  res.json({ ...oturum, dolu, katilimcilar });
});

// ---------- Katılım ----------

// Derse müşteri ekle (kontenjan ve tekrar kontrolüyle)
app.post('/oturumlar/:id/katilimlar', (req, res) => {
  const oturumId = Number(req.params.id);
  const musteriId = Number(req.body.musteri_id);
  if (!Number.isInteger(musteriId)) {
    return res.status(400).json({ hata: 'musteri_id zorunludur.' });
  }

  try {
    const ekle = db.transaction(() => {
      const oturum = db
        .prepare('SELECT id, kontenjan FROM ders_oturumu WHERE id = ?')
        .get(oturumId);
      if (!oturum) throw new IsKuraliHatasi(404, 'Ders oturumu bulunamadı.');

      const musteri = db.prepare('SELECT id FROM musteri WHERE id = ?').get(musteriId);
      if (!musteri) throw new IsKuraliHatasi(404, 'Müşteri bulunamadı.');

      const mevcut = db
        .prepare('SELECT id, durum FROM katilim WHERE oturum_id = ? AND musteri_id = ?')
        .get(oturumId, musteriId);
      if (mevcut && mevcut.durum !== 'iptal') {
        throw new IsKuraliHatasi(409, 'Müşteri bu derse zaten kayıtlı.');
      }

      if (doluSayisi(oturumId) >= oturum.kontenjan) {
        throw new IsKuraliHatasi(409, `Ders dolu (kontenjan ${oturum.kontenjan}).`);
      }

      // Daha önce iptal etmişse aynı kaydı yeniden aç
      if (mevcut) {
        db.prepare("UPDATE katilim SET durum = 'kayitli' WHERE id = ?").run(mevcut.id);
        return mevcut.id;
      }
      return db
        .prepare('INSERT INTO katilim (oturum_id, musteri_id) VALUES (?, ?)')
        .run(oturumId, musteriId).lastInsertRowid;
    });

    const id = ekle();
    res.status(201).json({ katilim_id: id, durum: 'kayitli' });
  } catch (e) {
    hataYonet(res, e);
  }
});

// Durum değiştir: kayitli / geldi / gelmedi / iptal
// "geldi" olunca hak düşer (multisport hariç), "geldi"den çıkınca hak iade edilir.
app.patch('/katilimlar/:id/durum', (req, res) => {
  const katilimId = Number(req.params.id);
  const yeni = req.body.durum;
  if (!DURUMLAR.includes(yeni)) {
    return res
      .status(400)
      .json({ hata: 'durum kayitli, geldi, gelmedi veya iptal olmalı.' });
  }

  try {
    const guncelle = db.transaction(() => {
      const k = db
        .prepare(
          `SELECT k.id, k.oturum_id, k.musteri_id, k.durum, k.paket_id, m.uyelik_turu
           FROM katilim k
           JOIN musteri m ON m.id = k.musteri_id
           WHERE k.id = ?`
        )
        .get(katilimId);
      if (!k) throw new IsKuraliHatasi(404, 'Katılım kaydı bulunamadı.');

      const eski = k.durum;
      if (eski === yeni) return { durum: yeni, degisti: false };

      // İptalden geri dönmek için yer olmalı
      if (eski === 'iptal') {
        const oturum = db
          .prepare('SELECT kontenjan FROM ders_oturumu WHERE id = ?')
          .get(k.oturum_id);
        if (doluSayisi(k.oturum_id, k.id) >= oturum.kontenjan) {
          throw new IsKuraliHatasi(409, 'Ders dolu, iptal geri alınamaz.');
        }
      }

      let paketId = k.paket_id;

      // Önceden "geldi" idiyse düşülen hakkı iade et
      if (eski === 'geldi' && paketId) {
        db.prepare('UPDATE paket SET kalan_seans = kalan_seans + 1 WHERE id = ?').run(
          paketId
        );
        paketId = null;
      }

      // "geldi" olunca hak düş (multisport üyelerinde düşmez)
      if (yeni === 'geldi' && k.uyelik_turu !== 'multisport') {
        const paket = db
          .prepare(
            `SELECT id FROM paket
             WHERE musteri_id = ? AND kalan_seans > 0
             ORDER BY baslangic_tarihi, id
             LIMIT 1`
          )
          .get(k.musteri_id);
        if (!paket) {
          throw new IsKuraliHatasi(400, 'Müşterinin kalan seans hakkı yok.');
        }
        db.prepare('UPDATE paket SET kalan_seans = kalan_seans - 1 WHERE id = ?').run(
          paket.id
        );
        paketId = paket.id;
      }

      db.prepare('UPDATE katilim SET durum = ?, paket_id = ? WHERE id = ?').run(
        yeni,
        paketId,
        k.id
      );
      return { durum: yeni, degisti: true };
    });

    res.json({ katilim_id: katilimId, ...guncelle() });
  } catch (e) {
    hataYonet(res, e);
  }
});

app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});