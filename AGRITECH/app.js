document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menuBtn');
    const closeSidebar = document.getElementById('closeSidebar');
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const previewArea = document.getElementById('previewArea');
    const imagePreview = document.getElementById('imagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const browseGalleryBtn = document.getElementById('browseGalleryBtn');
    const openCameraBtn = document.getElementById('openCameraBtn');
    const cameraModal = document.getElementById('cameraModal');
    const closeCameraBtn = document.getElementById('closeCameraBtn');
    const cameraStream = document.getElementById('cameraStream');
    const captureBtn = document.getElementById('captureBtn');
    const cameraCanvas = document.getElementById('cameraCanvas');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const resultsSection = document.getElementById('resultsSection');
    const newScanBtn = document.getElementById('newScanBtn');

    let mediaStream = null;

    // ── Auth Guard & Profile ─────────────────────────────────────
    if (window.AuthService) {
        AuthService.onAuthStateChange((user) => {
            if (!user) {
                // Not logged in → redirect to login
                window.location.href = 'login.html';
                return;
            }
            // Populate profile dropdown
            const name      = user.displayName || 'User';
            const email     = user.email || '';
            const photo     = user.photoURL || null;
            const isGuest   = user.isGuest || user.isAnonymous || false;
            const initials  = AuthService.getInitials(name);

            // Small avatar
            document.getElementById('profileInitials').textContent = initials;
            if (photo) {
                const img = document.getElementById('profilePhoto');
                img.src = photo; img.style.display = 'block';
                document.getElementById('profileInitials').style.display = 'none';
            }
            // Large avatar in dropdown
            document.getElementById('profileInitialsLg').textContent = initials;
            if (photo) {
                const imgLg = document.getElementById('profilePhotoLg');
                imgLg.src = photo; imgLg.style.display = 'block';
                document.getElementById('profileInitialsLg').style.display = 'none';
            }
            document.getElementById('profileName').textContent  = name;
            document.getElementById('profileEmail').textContent = email || 'Guest User';

            // Badge
            const badge = document.getElementById('profileBadge');
            const badgeText = document.getElementById('profileBadgeText');
            if (isGuest) {
                badge.classList.add('guest');
                badgeText.textContent = '👤 Guest Mode';
            } else {
                badgeText.textContent = '✅ Signed In';
            }
        });

        // Profile dropdown toggle
        const userProfileBtn = document.getElementById('userProfileBtn');
        const profileDropdown = document.getElementById('profileDropdown');
        userProfileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('open');
        });
        document.addEventListener('click', () => profileDropdown.classList.remove('open'));

        // Sign Out
        document.getElementById('signOutBtn').addEventListener('click', async () => {
            await AuthService.signOut();
        });
    }

    // Initialize ML Service

    if (window.MLService) {
        window.MLService.init();
    }

    // Initialize Weather Service
    if (window.WeatherService) {
        window.WeatherService.init();
    }


    // Language Selection Logic
    const languageSelector = document.getElementById('languageSelector');
    let currentLang = localStorage.getItem('agritech_lang') || 'en';
    languageSelector.value = currentLang;

    function translatePage(lang) {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (window.getTranslation) {
                el.textContent = window.getTranslation(lang, key);
            }
        });
        
        // Also translate any active AI results if present
        if (resultsSection.style.display === 'block') {
            const diseaseKey = document.getElementById('resultDisease').getAttribute('data-key');
            if (diseaseKey) document.getElementById('resultDisease').textContent = window.getTranslation(lang, diseaseKey);
            
            const symptomsKey = document.getElementById('resultSymptoms').getAttribute('data-key');
            if (symptomsKey) document.getElementById('resultSymptoms').textContent = window.getTranslation(lang, symptomsKey);
            
            const causesKey = document.getElementById('resultCauses').getAttribute('data-key');
            if (causesKey) document.getElementById('resultCauses').textContent = window.getTranslation(lang, causesKey);
            
            const organicKey = document.getElementById('resultOrganic').getAttribute('data-key');
            if (organicKey) document.getElementById('resultOrganic').textContent = window.getTranslation(lang, organicKey);
            
            const chemicalKey = document.getElementById('resultChemical').getAttribute('data-key');
            if (chemicalKey) document.getElementById('resultChemical').textContent = window.getTranslation(lang, chemicalKey);
            
            const preventionKey = document.getElementById('resultPrevention').getAttribute('data-key');
            if (preventionKey) document.getElementById('resultPrevention').textContent = window.getTranslation(lang, preventionKey);
        }
    }

    languageSelector.addEventListener('change', (e) => {
        currentLang = e.target.value;
        localStorage.setItem('agritech_lang', currentLang);
        translatePage(currentLang);
    });

    // Initial Translation
    if (window.getTranslation) {
        translatePage(currentLang);
    }


    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then((registration) => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                }, (err) => {
                    console.log('ServiceWorker registration failed: ', err);
                });
        });
    }

    // Offline / Online Status Logic
    const offlineBanner = document.getElementById('offlineBanner');
    
    function updateOnlineStatus() {
        if (!navigator.onLine) {
            offlineBanner.classList.add('active');
        } else {
            offlineBanner.classList.remove('active');
            syncReports();
        }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Initial check
    updateOnlineStatus();

    // IndexedDB Setup for Offline Reports
    let db;
    const request = indexedDB.open("AgriTechDB", 1);

    request.onerror = (event) => {
        console.error("Database error: ", event.target.error);
    };

    request.onupgradeneeded = (event) => {
        db = event.target.result;
        const objectStore = db.createObjectStore("reports", { keyPath: "id", autoIncrement: true });
        objectStore.createIndex("status", "status", { unique: false });
    };

    request.onsuccess = (event) => {
        db = event.target.result;
        if(navigator.onLine) syncReports();
    };

    function saveReportLocally(reportData) {
        if (!db) return;
        const status = navigator.onLine ? 'synced' : 'pending';
        const report = { ...reportData, status, date: new Date().toISOString() };
        
        const transaction = db.transaction(["reports"], "readwrite");
        const objectStore = transaction.objectStore("reports");
        objectStore.add(report);
        
        transaction.oncomplete = () => {
            console.log(`Report saved locally with status: ${status}`);
        };
    }

    function syncReports() {
        if (!db) return;
        const transaction = db.transaction(["reports"], "readwrite");
        const objectStore = transaction.objectStore("reports");
        const index = objectStore.index("status");
        
        index.openCursor(IDBKeyRange.only('pending')).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                // Simulate syncing to a server
                console.log(`Syncing report ID ${cursor.value.id} to server...`);
                
                // Update status to synced
                const updateData = cursor.value;
                updateData.status = 'synced';
                const requestUpdate = cursor.update(updateData);
                
                requestUpdate.onsuccess = () => {
                    console.log(`Report ID ${cursor.value.id} synced successfully.`);
                };
                
                cursor.continue();
            }
        };
    }

    // Sidebar Toggle Logic
    menuBtn.addEventListener('click', () => {
        sidebar.classList.add('active');
    });

    closeSidebar.addEventListener('click', () => {
        sidebar.classList.remove('active');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !menuBtn.contains(e.target) && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
            }
        }
    });

    // File Upload Logic
    uploadArea.addEventListener('click', (e) => {
        if(e.target.closest('.upload-actions-inline')) return;
        fileInput.click();
    });

    browseGalleryBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // Camera Logic
    openCameraBtn.addEventListener('click', async () => {
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            cameraStream.srcObject = mediaStream;
            cameraModal.classList.add('active');
        } catch (err) {
            alert('Unable to access camera: ' + err.message);
        }
    });

    function stopCamera() {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }
        cameraStream.srcObject = null;
        cameraModal.classList.remove('active');
    }

    closeCameraBtn.addEventListener('click', stopCamera);

    captureBtn.addEventListener('click', () => {
        if (mediaStream) {
            cameraCanvas.width = cameraStream.videoWidth;
            cameraCanvas.height = cameraStream.videoHeight;
            const ctx = cameraCanvas.getContext('2d');
            ctx.drawImage(cameraStream, 0, 0, cameraCanvas.width, cameraCanvas.height);
            
            const imageUrl = cameraCanvas.toDataURL('image/jpeg');
            
            imagePreview.src = imageUrl;
            uploadArea.style.display = 'none';
            previewArea.style.display = 'flex';
            
            stopCamera();
        }
    });

    // Drag and Drop Logic
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.remove('dragover');
        }, false);
    });

    uploadArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            
            // Check if file is an image
            if (!file.type.startsWith('image/')) {
                alert('Please upload an image file.');
                return;
            }

            const reader = new FileReader();
            reader.readAsDataURL(file);
            
            reader.onloadend = function() {
                // Show preview
                imagePreview.src = reader.result;
                uploadArea.style.display = 'none';
                previewArea.style.display = 'flex';
            }
        }
    }

    // Remove Image
    removeImageBtn.addEventListener('click', () => {
        fileInput.value = ''; // Clear the input
        imagePreview.src = '';
        previewArea.style.display = 'none';
        uploadArea.style.display = 'flex';
    });

    // Placeholder Analyze Button
    analyzeBtn.addEventListener('click', async () => {
        if (!imagePreview.src) return;

        loadingOverlay.classList.add('active');

        try {
            // Use the ML Service for prediction
            const result = await window.MLService.predict(imagePreview);
            
            // Populate results
            // Populate results (storing keys for dynamic translation if language changes)
            const elDisease = document.getElementById('resultDisease');
            elDisease.textContent = window.getTranslation(currentLang, result.disease);
            elDisease.setAttribute('data-key', result.disease);
            
            document.getElementById('resultConfidence').textContent = `${result.confidence.toFixed(1)}% Confidence`;
            
            const elSymptoms = document.getElementById('resultSymptoms');
            elSymptoms.textContent = window.getTranslation(currentLang, result.symptoms);
            elSymptoms.setAttribute('data-key', result.symptoms);
            
            const elCauses = document.getElementById('resultCauses');
            elCauses.textContent = window.getTranslation(currentLang, result.causes);
            elCauses.setAttribute('data-key', result.causes);
            
            const elOrganic = document.getElementById('resultOrganic');
            elOrganic.textContent = window.getTranslation(currentLang, result.organicTreatment);
            elOrganic.setAttribute('data-key', result.organicTreatment);
            
            const elChemical = document.getElementById('resultChemical');
            elChemical.textContent = window.getTranslation(currentLang, result.chemicalTreatment);
            elChemical.setAttribute('data-key', result.chemicalTreatment);
            
            const elPrevention = document.getElementById('resultPrevention');
            elPrevention.textContent = window.getTranslation(currentLang, result.prevention);
            elPrevention.setAttribute('data-key', result.prevention);

            // Show results section
            resultsSection.style.display = 'block';
            resultsSection.scrollIntoView({ behavior: 'smooth' });

            // ── Persist to Firestore + localStorage fallback ──────────
            if (window.DBService) {
                // Capture weather snapshot if available
                const weatherSnapshot = (() => {
                    try {
                        const w = JSON.parse(localStorage.getItem('agritech_weather_cache') || '{}');
                        return w.data ? {
                            temp: w.data.temp, humidity: w.data.humidity,
                            city: w.data.city, condition: w.data.condition
                        } : null;
                    } catch { return null; }
                })();

                // 1. Disease history entry (lightweight)
                const historyId = await DBService.diseaseHistory.addEntry({
                    disease:       result.disease,
                    confidence:    result.confidence,
                    cropName:      'Unknown',
                    location:      weatherSnapshot ? weatherSnapshot.city : 'Unknown',
                    weatherSnapshot
                });

                // 2. Full diagnostic report (detailed)
                await DBService.savedReports.saveReport({
                    disease:          result.disease,
                    confidence:       result.confidence,
                    symptoms:         result.symptoms,
                    causes:           result.causes,
                    organicTreatment: result.organicTreatment,
                    chemicalTreatment: result.chemicalTreatment,
                    prevention:       result.prevention,
                    weatherAtScan:    weatherSnapshot,
                    historyId
                });

                // 3. Image metadata (no base64 in Firestore — just a reference key)
                const imageCacheKey = `scan_${Date.now()}`;
                await DBService.images.saveImageMeta({
                    localCacheKey:    imageCacheKey,
                    relatedDiseaseId: historyId,
                    disease:          result.disease
                });

                console.log('DBService: Scan data fully persisted.');
            }

            // Legacy IndexedDB save (kept for backward compatibility)
            saveReportLocally({
                disease:    result.disease,
                confidence: result.confidence,
                image:      imagePreview.src
            });
            
        } catch (error) {
            console.error("Detection error:", error);
            alert("An error occurred during detection. Please try again.");
        } finally {
            loadingOverlay.classList.remove('active');
        }
    });

    // New Scan Logic
    newScanBtn.addEventListener('click', () => {
        resultsSection.style.display = 'none';
        previewArea.style.display = 'none';
        uploadArea.style.display = 'flex';
        fileInput.value = '';
        imagePreview.src = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});
