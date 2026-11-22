const Database = require('better-sqlite3');
const db = new Database('pilates.db');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS musteri (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad TEXT NOT NULL,
  telefon TEXT,
  not_metni TEXT
);

CREATE TABLE IF NOT EXISTS paket (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  musteri_id INTEGER NOT NULL REFERENCES musteri(id),
  toplam_seans INTEGER NOT NULL,
  kalan_seans INTEGER NOT NULL,
  baslangic_tarihi TEXT NOT NULL,
  bitis_tarihi TEXT
);

CREATE TABLE IF NOT EXISTS ders_oturumu (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tarih TEXT NOT NULL,
  saat TEXT NOT NULL,
  kontenjan INTEGER NOT NULL DEFAULT 5,
  not_metni TEXT
);

CREATE TABLE IF NOT EXISTS katilim (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oturum_id INTEGER NOT NULL REFERENCES ders_oturumu(id),
  musteri_id INTEGER NOT NULL REFERENCES musteri(id),
  durum TEXT NOT NULL DEFAULT 'kayitli'
    CHECK (durum IN ('kayitli', 'geldi', 'gelmedi', 'iptal')),
  UNIQUE (oturum_id, musteri_id)
);
`);

module.exports = db;