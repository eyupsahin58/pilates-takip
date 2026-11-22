const express = require('express');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(express.json());

const UYELIK_TURLERI = ['normal', 'multisport', 'deneme'];

app.get('/', (req, res) => {
  res.send('Merhaba! Pilates takip sunucusu çalışıyor.');
});

// Müşterileri listele (üyelik türü ve kalan seans toplamıyla)
app.get('/musteriler', (req, res) => {
  const musteriler = db.prepare(`
    SELECT m.id, m.ad, m.telefon, m.uyelik_turu, m.not_metni,
           COALESCE(SUM(p.kalan_seans), 0) AS kalan_seans
    FROM musteri m
    LEFT JOIN paket p ON p.musteri_id = m.id
    GROUP BY m.id
    ORDER BY m.ad
  `).all();
  res.json(musteriler);
});

// Yeni müşteri ekle (deneme üyesine otomatik 1 seanslık paket verilir)
app.post('/musteriler', (req, res) => {
  const { ad, telefon, not_metni, uyelik_turu = 'normal' } = req.body;
  if (!ad || !ad.trim()) {
    return res.status(400).json({ hata: 'Ad zorunludur.' });
  }
  if (!UYELIK_TURLERI.includes(uyelik_turu)) {
    return res.status(400).json({ hata: 'uyelik_turu normal, multisport veya deneme olmalı.' });
  }

  const ekle = db.transaction(() => {
    const sonuc = db
      .prepare('INSERT INTO musteri (ad, telefon, uyelik_turu, not_metni) VALUES (?, ?, ?, ?)')
      .run(ad.trim(), telefon || null, uyelik_turu, not_metni || null);
    if (uyelik_turu === 'deneme') {
      db.prepare(
        'INSERT INTO paket (musteri_id, toplam_seans, kalan_seans, baslangic_tarihi) VALUES (?, 1, 1, ?)'
      ).run(sonuc.lastInsertRowid, new Date().toISOString().slice(0, 10));
    }
    return sonuc.lastInsertRowid;
  });

  const id = ekle();
  res.status(201).json({ id, ad: ad.trim(), uyelik_turu });
});

// Müşteri sil (önce paketleri ve katılımları, sonra müşteriyi)
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

// Müşteriye paket tanımla
app.post('/musteriler/:id/paketler', (req, res) => {
  const musteriId = Number(req.params.id);
  const { toplam_seans, baslangic_tarihi } = req.body;

  const musteri = db.prepare('SELECT id FROM musteri WHERE id = ?').get(musteriId);
  if (!musteri) {
    return res.status(404).json({ hata: 'Müşteri bulunamadı.' });
  }
  if (!Number.isInteger(toplam_seans) || toplam_seans <= 0) {
    return res.status(400).json({ hata: 'toplam_seans pozitif bir tam sayı olmalı.' });
  }

  const tarih = baslangic_tarihi || new Date().toISOString().slice(0, 10);
  const sonuc = db
    .prepare(
      'INSERT INTO paket (musteri_id, toplam_seans, kalan_seans, baslangic_tarihi) VALUES (?, ?, ?, ?)'
    )
    .run(musteriId, toplam_seans, toplam_seans, tarih);
  res.status(201).json({ id: sonuc.lastInsertRowid, kalan_seans: toplam_seans });
});

app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});