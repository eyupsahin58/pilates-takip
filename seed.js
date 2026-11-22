const db = require('./db');

const musteriEkle = db.prepare(
  'INSERT INTO musteri (ad, telefon, uyelik_turu) VALUES (?, ?, ?)'
);
const paketEkle = db.prepare(
  'INSERT INTO paket (musteri_id, toplam_seans, kalan_seans, baslangic_tarihi) VALUES (?, ?, ?, ?)'
);
const oturumEkle = db.prepare('INSERT INTO ders_oturumu (tarih, saat) VALUES (?, ?)');
const katilimEkle = db.prepare('INSERT INTO katilim (oturum_id, musteri_id) VALUES (?, ?)');

const ayse = musteriEkle.run('Ayşe Deneme', '0500 000 00 01', 'normal').lastInsertRowid;
const elif = musteriEkle.run('Elif Örnek', '0500 000 00 02', 'multisport').lastInsertRowid;
const zeynep = musteriEkle.run('Zeynep Test', '0500 000 00 03', 'deneme').lastInsertRowid;

paketEkle.run(ayse, 8, 8, '2026-11-23');   // normal: 8 seanslık paket
paketEkle.run(zeynep, 1, 1, '2026-11-23'); // deneme: 1 seanslık ücretsiz hak
// multisport üyesi için paket yok

const ders1 = oturumEkle.run('2026-11-24', '19:00').lastInsertRowid;
const ders2 = oturumEkle.run('2026-11-26', '19:00').lastInsertRowid;

katilimEkle.run(ders1, ayse);
katilimEkle.run(ders1, elif);
katilimEkle.run(ders2, zeynep);

console.log('Örnek veriler eklendi.');