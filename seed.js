const db = require('./db');

const musteriEkle = db.prepare('INSERT INTO musteri (ad, telefon) VALUES (?, ?)');
const paketEkle = db.prepare(
  'INSERT INTO paket (musteri_id, toplam_seans, kalan_seans, baslangic_tarihi) VALUES (?, ?, ?, ?)'
);
const oturumEkle = db.prepare('INSERT INTO ders_oturumu (tarih, saat) VALUES (?, ?)');
const katilimEkle = db.prepare('INSERT INTO katilim (oturum_id, musteri_id) VALUES (?, ?)');

const ayse = musteriEkle.run('Ayşe Deneme', '0500 000 00 01').lastInsertRowid;
const elif = musteriEkle.run('Elif Örnek', '0500 000 00 02').lastInsertRowid;
const zeynep = musteriEkle.run('Zeynep Test', '0500 000 00 03').lastInsertRowid;

paketEkle.run(ayse, 8, 8, '2026-11-23');
paketEkle.run(elif, 8, 5, '2026-11-02');
paketEkle.run(zeynep, 12, 12, '2026-11-16');

const ders1 = oturumEkle.run('2026-11-24', '19:00').lastInsertRowid;
const ders2 = oturumEkle.run('2026-11-26', '19:00').lastInsertRowid;

katilimEkle.run(ders1, ayse);
katilimEkle.run(ders1, elif);
katilimEkle.run(ders2, zeynep);

console.log('Örnek veriler eklendi.');