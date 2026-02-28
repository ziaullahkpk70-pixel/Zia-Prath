/**
 * ZP Quran V2 Engine
 * Full Offline Support via IndexedDB (Infinity Storage)
 */

window.onload = () => {
    lucide.createIcons();
};

/* -------------------------------
 * 1. Database (IndexedDB) Setup
 * ------------------------------- */
const DB_NAME = "ZPQuran_Offline_V2";
let db;

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (e) => {
            db = e.target.result;
            // Store for completely downloaded surahs
            if (!db.objectStoreNames.contains('surahs')) {
                db.createObjectStore('surahs', { keyPath: 'id' });
            }
            // Store for the index list
            if (!db.objectStoreNames.contains('metadata')) {
                db.createObjectStore('metadata', { keyPath: 'id' });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(true);
        };
        request.onerror = (e) => reject("DB Error");
    });
};

const saveDB = (store, data) => {
    return new Promise((resolve) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(data);
        tx.oncomplete = () => resolve();
    });
};

const getDB = (store, id) => {
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(store, 'readonly');
            const req = tx.objectStore(store).get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
};

/* -------------------------------
 * 2. Core Application Logic
 * ------------------------------- */
let currentSurahId = 1;
const API_BASE = "https://api.alquran.cloud/v1";

async function bootApp() {
    try {
        await initDB();
        await loadSurahList();

        // Hide Splash, Show App
        setTimeout(() => {
            document.getElementById('splash-screen').style.display = 'none';
            document.getElementById('main-app').style.display = 'flex';
            loadSurah(1); // Load Fatiha First
        }, 1000);

    } catch (error) {
        console.error("Boot failure:", error);
        alert("اسٹیٹرٹ اپ میں مسئلہ آ گیا۔ براہ کرم ریفریش کریں۔");
    }
}

async function loadSurahList() {
    let cachedList = await getDB('metadata', 'surah_list');

    if (!cachedList) {
        // Fetch from API
        try {
            const res = await fetch(`${API_BASE}/surah`);
            const json = await res.json();
            cachedList = { id: 'surah_list', data: json.data };
            await saveDB('metadata', cachedList);
        } catch (err) {
            alert("No internet & no offline data! Connect to internet to download list.");
            return;
        }
    }

    renderSidebarList(cachedList.data);
}

function renderSidebarList(surahs) {
    const listHtml = surahs.map(s => `
        <div class="s-card" id="card-${s.number}" onclick="loadSurah(${s.number})">
            <div class="s-num">${s.number}</div>
            <div style="flex: 1;">
                <div style="color: var(--text-primary); font-weight: bold; font-size: 1rem;">${s.englishName}</div>
                <div style="color: var(--text-sec); font-size: 0.75rem;">${s.revelationType} - ${s.numberOfAyahs} Ayahs</div>
            </div>
            <div style="font-family: 'Amiri', serif; font-size: 1.3rem; color: var(--gold);">${s.name}</div>
        </div>
    `).join('');

    document.getElementById('surah-list').innerHTML = listHtml;
}

/* -------------------------------
 * 3. Surah Loading Engine
 * ------------------------------- */
async function loadSurah(num) {
    currentSurahId = num;

    // Toggle Mobile Sidebar Close
    document.getElementById('sidebar').classList.remove('open');

    // UI Update - Loading State
    const container = document.getElementById('verses-container');
    container.innerHTML = `<div class="spinner" style="margin: 50px auto;"></div><p style="text-align:center; color: var(--gold);">Downloading & Decoding Data...</p>`;

    // Highlight list item
    document.querySelectorAll('.s-card').forEach(el => el.classList.remove('active'));
    document.getElementById(`card-${num}`)?.classList.add('active');

    // 1. Check Offline Database (IndexedDB)
    let cachedSurah = await getDB('surahs', num);

    if (cachedSurah) {
        // Offline Hit => Ultra Fast
        document.getElementById('network-icon').setAttribute('color', 'var(--text-sec)'); // Green WiFi
        renderVerses(cachedSurah);
        return;
    }

    // 2. Fetch via Network
    document.getElementById('network-icon').setAttribute('color', 'var(--gold-dark)'); // Yellowing indicating download
    lucide.createIcons();

    try {
        // Fetch Arabic (Uthmani), Urdu (Junagarhi), English (Yusuf Ali)
        const [arRes, urRes, enRes] = await Promise.all([
            fetch(`${API_BASE}/surah/${num}/quran-uthmani`),
            fetch(`${API_BASE}/surah/${num}/ur.junagarhi`),
            fetch(`${API_BASE}/surah/${num}/en.yusufali`)
        ]);

        if (!arRes.ok) throw new Error("API Failure");

        const arJson = await arRes.json();
        const urJson = await urRes.json();
        const enJson = await enRes.json();

        // Prepare Offline Package
        const surahPackage = {
            id: num,
            metadata: {
                name: arJson.data.name,
                englishName: arJson.data.englishName,
                numberOfAyahs: arJson.data.numberOfAyahs,
                revelationType: arJson.data.revelationType
            },
            arabic: arJson.data.ayahs,
            urdu: urJson.data.ayahs,
            english: enJson.data.ayahs
        };

        // Save to Offline Database Infinity Cache
        await saveDB('surahs', surahPackage);

        // Render from fresh package
        renderVerses(surahPackage);
        document.getElementById('network-icon').setAttribute('color', 'var(--text-primary)'); // Restore
        lucide.createIcons();

    } catch (err) {
        console.error("Failed to load surah:", err);
        container.innerHTML = `<div style="text-align: center; padding: 3rem; background: rgba(255,0,0,0.1); border: 1px solid red; border-radius: 10px; margin: 2rem;">
            <i data-lucide="wifi-off" style="width: 50px; height: 50px; color: red;"></i>
            <h3 style="color: white; margin-top: 10px;">انٹرنیٹ کنکشن کا مسئلہ</h3>
            <p style="color: var(--text-sec); margin-top: 10px;">یہ سورت آف لائن محفوظ نہیں ہے۔ ڈاون لوڈ کرنے کے لئے انٹرنیٹ درکار ہے۔</p>
            <button onclick="loadSurah(${num})" style="padding: 10px 20px; background: var(--gold); border:none; border-radius: 5px; margin-top: 15px; font-weight: bold; cursor: pointer;">دوبارہ کوشش کریں</button>
        </div>`;
        lucide.createIcons();
    }
}

/* -------------------------------
 * 4. Rendering Interface
 * ------------------------------- */
function renderVerses(surahPackage) {
    // Top Info Update
    document.getElementById('header-surah-name').innerText = surahPackage.metadata.englishName;

    document.getElementById('surah-info').innerHTML = `
        <h2 style="color: var(--gold); font-family: 'Amiri', serif; font-size: 2rem; margin-bottom: 5px;">${surahPackage.metadata.name}</h2>
        <p>${surahPackage.metadata.revelationType.toUpperCase()} | ${surahPackage.metadata.numberOfAyahs} AYAHS</p>
    `;

    const container = document.getElementById('verses-container');
    const template = document.getElementById('verse-card-template');

    container.innerHTML = ''; // Clear container

    // Auto-Bismillah for all except Surah 1 & 9
    if (surahPackage.id !== 1 && surahPackage.id !== 9) {
        const b = document.createElement('div');
        b.style.textAlign = 'center';
        b.style.fontFamily = "'Amiri', serif";
        b.style.fontSize = '2.5rem';
        b.style.color = 'var(--gold)';
        b.style.marginBottom = '2.5rem';
        b.innerText = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
        container.appendChild(b);
    }

    // Build the verses
    const frag = document.createDocumentFragment();

    surahPackage.arabic.forEach((ayah, index) => {
        const clone = template.content.cloneNode(true);
        const urText = surahPackage.urdu[index].text;
        const enText = surahPackage.english[index].text;

        clone.querySelector('.ayah-number').innerText = ayah.numberInSurah;
        clone.querySelector('.arabic-text').innerText = ayah.text;

        // Exact same complete text for "Boxes" (as modern split requirement)
        clone.querySelector('.urdu-box .box-content').innerText = urText;
        clone.querySelector('.english-box .box-content').innerText = enText;

        // Exact same complete text for bottom lines
        clone.querySelector('.urdu-text.full').innerText = urText;
        clone.querySelector('.eng-text.full').innerText = enText;

        frag.appendChild(clone);
    });

    container.appendChild(frag);
    container.scrollTop = 0; // Scroll back to top
    lucide.createIcons();
}

/* -------------------------------
 * 5. Event Listeners
 * ------------------------------- */
document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

document.getElementById('close-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
});

// Fire up
bootApp();
