const gorunum = document.getElementById('gorunum');
const mesaj = document.getElementById('mesaj');

const GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DURUM_ETIKET = { kayitli: 'Kayıtlı', geldi: 'Geldi', gelmedi: 'Gelmedi', iptal: 'İptal' };
const UYELIK_ETIKET = { normal: 'Normal', multisport: 'Multisport', deneme: 'Deneme' };

// ---------- Yardımcılar ----------

// Kullanıcıdan gelen metni ekrana basmadan önce güvenli hale getirir (XSS koruması)
function esc(metin) {
  return String(metin ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function bildir(metin, hata = false) {
  mesaj.textContent = metin;
  mesaj.className = metin ? (hata ? 'mesaj hata' : 'mesaj tamam') : 'mesaj';
}

async function api(yol, secenekler = {}) {
  const cevap = await fetch(yol, {
    headers: { 'Content-Type': 'application/json' },
    ...secenekler,
  });
  const veri = await cevap.json().catch(() => ({}));
  if (!cevap.ok) throw new Error(veri.hata || 'Bir hata oluştu.');
  return veri;
}

// Yerel saate göre YYYY-AA-GG (toISOString saat dilimi yüzünden kayabilir)
function tarihStr(d) {
  const y = d.getFullYear();
  const a = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${a}-${g}`;
}

function gosterTarih(str) {
  const [y, a, g] = str.split('-');
  return `${g}.${a}.${y}`;
}

function gunEkle(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Verilen günün haftasının Pazartesi'sini bulur
function haftaBasi(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

// Bir ekran fonksiyonunu çalıştırır, hata olursa üstte kırmızı mesaj gösterir
async function calistir(fonk, ...args) {
  try {
    await fonk(...args);
  } catch (e) {
    bildir(e.message, true);
  }
}

let haftaBaslangic = haftaBasi(new Date());

// ---------- Takvim ----------

async function takvimGoster() {
  bildir('');
  const bas = tarihStr(haftaBaslangic);
  const bit = tarihStr(gunEkle(haftaBaslangic, 6));
  const oturumlar = await api(`/oturumlar?baslangic=${bas}&bitis=${bit}`);

  let html = `
    <div class="hafta-bar">
      <button id="onceki">&larr;</button>
      <strong>${gosterTarih(bas)} – ${gosterTarih(bit)}</strong>
      <button id="sonraki">&rarr;</button>
    </div>`;

  for (let i = 0; i < 7; i++) {
    const tarih = tarihStr(gunEkle(haftaBaslangic, i));
    const dersler = oturumlar.filter((o) => o.tarih === tarih);
    html += `<section class="gun"><h3>${GUNLER[i]} <small>${gosterTarih(tarih)}</small></h3>`;
    if (dersler.length === 0) html += '<p class="bos">Ders yok</p>';
    for (const o of dersler) {
      const dolu = o.dolu >= o.kontenjan;
      html += `<button class="ders ${dolu ? 'dolu' : ''}" data-id="${o.id}">
        <span>${esc(o.saat)}</span><span>${o.dolu}/${o.kontenjan}</span>
      </button>`;
    }
    html += '</section>';
  }

  html += `
    <form id="yeni-ders" class="kart">
      <h3>Yeni ders ekle</h3>
      <label>Tarih <input type="date" name="tarih" required /></label>
      <label>Saat <input type="time" name="saat" required /></label>
      <label>Kontenjan <input type="number" name="kontenjan" value="5" min="1" required /></label>
      <button type="submit">Ders ekle</button>
    </form>`;

  gorunum.innerHTML = html;

  document.getElementById('onceki').onclick = () => {
    haftaBaslangic = gunEkle(haftaBaslangic, -7);
    calistir(takvimGoster);
  };
  document.getElementById('sonraki').onclick = () => {
    haftaBaslangic = gunEkle(haftaBaslangic, 7);
    calistir(takvimGoster);
  };
  gorunum.querySelectorAll('.ders').forEach((btn) => {
    btn.onclick = () => calistir(dersGoster, Number(btn.dataset.id));
  });
  document.getElementById('yeni-ders').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/oturumlar', {
        method: 'POST',
        body: JSON.stringify({
          tarih: f.get('tarih'),
          saat: f.get('saat'),
          kontenjan: Number(f.get('kontenjan')),
        }),
      });
      haftaBaslangic = haftaBasi(new Date(f.get('tarih') + 'T00:00'));
      await takvimGoster();
      bildir('Ders eklendi.');
    } catch (err) {
      bildir(err.message, true);
    }
  };
}

// ---------- Ders detayı ----------

async function dersGoster(id) {
  bildir('');
  const [oturum, musteriler] = await Promise.all([
    api(`/oturumlar/${id}`),
    api('/musteriler'),
  ]);

  const kayitliIdler = oturum.katilimcilar
    .filter((k) => k.durum !== 'iptal')
    .map((k) => k.musteri_id);
  const eklenebilir = musteriler.filter((m) => !kayitliIdler.includes(m.id));

  let html = `
    <button id="geri">&larr; Takvim</button>
    <h2>${gosterTarih(oturum.tarih)} – ${esc(oturum.saat)}</h2>
    <p>Doluluk: <strong>${oturum.dolu}/${oturum.kontenjan}</strong></p>
    <div class="kart">`;

  if (oturum.katilimcilar.length === 0) html += '<p class="bos">Henüz katılımcı yok.</p>';

  for (const k of oturum.katilimcilar) {
    const butonlar = ['geldi', 'gelmedi', 'iptal']
      .map(
        (d) => `<button data-katilim="${k.katilim_id}" data-durum="${d}"
          ${k.durum === d ? 'disabled' : ''}>${DURUM_ETIKET[d]}</button>`
      )
      .join('');
    html += `
      <div class="satir">
        <div>
          <strong>${esc(k.ad)}</strong>
          <span class="rozet">${UYELIK_ETIKET[k.uyelik_turu]}</span><br />
          <small>Durum: ${DURUM_ETIKET[k.durum]}</small>
        </div>
        <div class="islem">${butonlar}</div>
      </div>`;
  }
  html += '</div>';

  html += `<form id="katilimci-ekle" class="kart"><h3>Derse müşteri ekle</h3>`;
  if (eklenebilir.length === 0) {
    html += '<p class="bos">Eklenebilecek müşteri yok.</p></form>';
  } else {
    html += `<select name="musteri_id">
      ${eklenebilir.map((m) => `<option value="${m.id}">${esc(m.ad)}</option>`).join('')}
    </select><br /><br /><button type="submit">Ekle</button></form>`;
  }

  gorunum.innerHTML = html;

  document.getElementById('geri').onclick = () => calistir(takvimGoster);

  gorunum.querySelectorAll('button[data-katilim]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/katilimlar/${btn.dataset.katilim}/durum`, {
          method: 'PATCH',
          body: JSON.stringify({ durum: btn.dataset.durum }),
        });
        await dersGoster(id);
      } catch (err) {
        bildir(err.message, true);
      }
    };
  });

  const form = document.getElementById('katilimci-ekle');
  if (form.querySelector('select')) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(`/oturumlar/${id}/katilimlar`, {
          method: 'POST',
          body: JSON.stringify({ musteri_id: Number(form.musteri_id.value) }),
        });
        await dersGoster(id);
      } catch (err) {
        bildir(err.message, true);
      }
    };
  }
}

// ---------- Müşteriler ----------

async function musterilerGoster() {
  bildir('');
  const musteriler = await api('/musteriler');

  let html = '<h2>Müşteriler</h2><div class="kart">';
  if (musteriler.length === 0) html += '<p class="bos">Henüz müşteri yok.</p>';

  for (const m of musteriler) {
    const multisport = m.uyelik_turu === 'multisport';
    const kalan = multisport ? 'Paket yok' : `${m.kalan_seans} seans kaldı`;
    const az = !multisport && m.kalan_seans <= 1 ? 'az' : '';
    html += `
      <div class="satir">
        <div>
          <strong>${esc(m.ad)}</strong>
          <span class="rozet">${UYELIK_ETIKET[m.uyelik_turu]}</span><br />
          <small>${esc(m.telefon || '')}</small>
        </div>
        <div class="${az}">${kalan}</div>
        <div class="islem">
          ${multisport ? '' : `<button data-paket="${m.id}">Paket ekle</button>`}
          <button class="tehlike" data-sil="${m.id}">Sil</button>
        </div>
      </div>`;
  }
  html += '</div>';

  html += `
    <form id="yeni-musteri" class="kart">
      <h3>Yeni müşteri</h3>
      <label>Ad <input type="text" name="ad" required /></label>
      <label>Telefon <input type="text" name="telefon" /></label>
      <label>Üyelik türü
        <select name="uyelik_turu">
          <option value="normal">Normal</option>
          <option value="multisport">Multisport</option>
          <option value="deneme">Deneme (1 ücretsiz seans)</option>
        </select>
      </label>
      <button type="submit">Müşteri ekle</button>
    </form>`;

  gorunum.innerHTML = html;

  gorunum.querySelectorAll('button[data-paket]').forEach((btn) => {
    btn.onclick = async () => {
      const giris = prompt('Kaç seanslık paket?', '8');
      if (giris === null) return;
      const seans = Number(giris);
      if (!Number.isInteger(seans) || seans <= 0) {
        return bildir('Seans sayısı pozitif bir tam sayı olmalı.', true);
      }
      try {
        await api(`/musteriler/${btn.dataset.paket}/paketler`, {
          method: 'POST',
          body: JSON.stringify({ toplam_seans: seans }),
        });
        await musterilerGoster();
        bildir('Paket eklendi.');
      } catch (err) {
        bildir(err.message, true);
      }
    };
  });

  gorunum.querySelectorAll('button[data-sil]').forEach((btn) => {
    btn.onclick = async () => {
      const m = musteriler.find((x) => x.id === Number(btn.dataset.sil));
      if (!confirm(`${m.ad} silinsin mi? Paketleri ve ders kayıtları da silinir.`)) return;
      try {
        await api(`/musteriler/${m.id}`, { method: 'DELETE' });
        await musterilerGoster();
        bildir('Müşteri silindi.');
      } catch (err) {
        bildir(err.message, true);
      }
    };
  });

  document.getElementById('yeni-musteri').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/musteriler', {
        method: 'POST',
        body: JSON.stringify({
          ad: f.get('ad'),
          telefon: f.get('telefon'),
          uyelik_turu: f.get('uyelik_turu'),
        }),
      });
      await musterilerGoster();
      bildir('Müşteri eklendi.');
    } catch (err) {
      bildir(err.message, true);
    }
  };
}

// ---------- Başlangıç ----------

document.getElementById('nav-takvim').onclick = () => calistir(takvimGoster);
document.getElementById('nav-musteriler').onclick = () => calistir(musterilerGoster);

calistir(takvimGoster);