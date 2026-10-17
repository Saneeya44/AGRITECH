const initApp = () => {
    console.log("AgriTech: Initializing App...");

    const getEl = (id) => document.getElementById(id);

    // --- DOM Elements ---
    const sidebar = getEl('sidebar');
    const menuBtn = getEl('menuBtn');
    const closeSidebar = getEl('closeSidebar');
    const uploadArea = getEl('uploadArea');
    const fileInput = getEl('fileInput');
    const browseGalleryBtn = getEl('browseGalleryBtn');
    const openCameraBtn = getEl('openCameraBtn');
    const cameraInput = getEl('cameraInput');
    const previewArea = getEl('previewArea');
    const imagePreview = getEl('imagePreview');
    const removeImageBtn = getEl('removeImageBtn');
    const analyzeBtn = getEl('analyzeBtn');
    const loadingOverlay = getEl('loadingOverlay');
    const cameraModal = getEl('cameraModal');
    const closeCameraBtn = getEl('closeCameraBtn');
    const cameraStream = getEl('cameraStream');
    const captureBtn = getEl('captureBtn');
    const cameraCanvas = getEl('cameraCanvas');
    const resultsSection = getEl('resultsSection');
    const newScanBtn = getEl('newScanBtn');
    const languageSelector = getEl('languageSelector');
    const settingsLanguageSelector = getEl('settingsLanguageSelector');

    const navLinks = document.querySelectorAll('.nav-links li');
    const viewSections = document.querySelectorAll('.view-section');
    const heroStartBtn = document.querySelector('.hero .primary-btn');

    let mediaStream = null;
    let currentLang = localStorage.getItem('agritech_lang') || 'en';

    // --- Core Functions ---

    function showImagePreview(src) {
        if (!imagePreview) return;
        imagePreview.src = src;
        if (uploadArea) uploadArea.style.display = 'none';
        if (previewArea) previewArea.style.display = 'flex';
        if (resultsSection) resultsSection.style.display = 'none';
    }

    function loadFileToPreview(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file (JPG, PNG, etc).');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => showImagePreview(e.target.result);
        reader.readAsDataURL(file);
    }

    function stopCamera() {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }
        if (cameraStream) cameraStream.srcObject = null;
        if (cameraModal) cameraModal.classList.remove('active');
    }

    // --- Services Integration ---

    if (window.MLService) window.MLService.init();
    if (window.WeatherService) window.WeatherService.init();

    // --- Language Setup ---
    function changeLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('agritech_lang', lang);
        if (languageSelector) languageSelector.value = lang;
        if (settingsLanguageSelector) settingsLanguageSelector.value = lang;
        if (window.applyTranslations) window.applyTranslations(lang);
    }

    if (languageSelector) {
        languageSelector.value = currentLang;
        languageSelector.addEventListener('change', (e) => changeLanguage(e.target.value));
    }
    if (settingsLanguageSelector) {
        settingsLanguageSelector.value = currentLang;
        settingsLanguageSelector.addEventListener('change', (e) => changeLanguage(e.target.value));
    }

    // Apply initial language
    if (window.applyTranslations) window.applyTranslations(currentLang);

    // --- Event Listeners ---

    // 1. Gallery Button
    if (browseGalleryBtn) {
        browseGalleryBtn.onclick = (e) => {
            e.stopPropagation();
            if (fileInput) fileInput.click();
        };
    }

    if (fileInput) {
        fileInput.onchange = function () {
            if (this.files && this.files[0]) loadFileToPreview(this.files[0]);
        };
    }

    // 2. Camera Button (WebRTC with Native Fallback)
    if (openCameraBtn) {
        openCameraBtn.onclick = async (e) => {
            e.stopPropagation();

            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                try {
                    mediaStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'environment' }
                    });
                    if (cameraStream) {
                        cameraStream.srcObject = mediaStream;
                        if (cameraModal) cameraModal.classList.add('active');
                    }
                    return;
                } catch (err) {
                    console.warn("WebRTC failed, using native input", err);
                }
            }
            if (cameraInput) cameraInput.click();
        };
    }

    if (cameraInput) {
        cameraInput.onchange = function () {
            if (this.files && this.files[0]) loadFileToPreview(this.files[0]);
        };
    }

    if (captureBtn) {
        captureBtn.onclick = () => {
            if (mediaStream && cameraStream && cameraCanvas) {
                cameraCanvas.width = cameraStream.videoWidth;
                cameraCanvas.height = cameraStream.videoHeight;
                const ctx = cameraCanvas.getContext('2d');
                ctx.drawImage(cameraStream, 0, 0);
                showImagePreview(cameraCanvas.toDataURL('image/jpeg'));
                stopCamera();
            }
        };
    }

    if (closeCameraBtn) closeCameraBtn.onclick = stopCamera;

    // 3. Analyze Button
    if (analyzeBtn) {
        analyzeBtn.onclick = async () => {
            if (!imagePreview.src || imagePreview.src.length < 100) {
                alert("Please select or capture a plant image first!");
                return;
            }

            loadingOverlay.classList.add('active');

            try {
                if (!imagePreview.complete) {
                    await new Promise(r => imagePreview.onload = r);
                }

                const result = await window.MLService.predict(imagePreview);

                // Update Results UI
                getEl('resultPlantType').textContent = result.plantName || "Plant";
                const elDisease = getEl('resultDisease');
                elDisease.textContent = window.getTranslation ? window.getTranslation(currentLang, result.disease) : result.disease;
                getEl('resultConfidence').textContent = `${result.confidence.toFixed(1)}% Confidence`;

                getEl('resultSymptoms').textContent = window.getTranslation ? window.getTranslation(currentLang, result.symptoms) : "N/A";
                getEl('resultCauses').textContent = window.getTranslation ? window.getTranslation(currentLang, result.causes) : "N/A";
                getEl('resultOrganic').textContent = window.getTranslation ? window.getTranslation(currentLang, result.organicTreatment) : "N/A";
                getEl('resultChemical').textContent = window.getTranslation ? window.getTranslation(currentLang, result.chemicalTreatment) : "N/A";
                getEl('resultPrevention').textContent = window.getTranslation ? window.getTranslation(currentLang, result.prevention) : (result.remedy || "N/A");
                
                const riskKey = result.disease.replace('disease_', 'risk_');
                getEl('resultSeasonalRisk').textContent = window.getTranslation ? window.getTranslation(currentLang, riskKey) : "Analysis based on current weather...";

                if (previewArea) previewArea.style.display = 'none';
                if (resultsSection) resultsSection.style.display = 'block';
                resultsSection.scrollIntoView({ behavior: 'smooth' });

            } catch (err) {
                console.error("Analysis failed", err);
                alert("Analysis failed. Please ensure the AI backend is running.");
            } finally {
                loadingOverlay.classList.remove('active');
            }
        };
    }

    // 4. Cleanup/Reset
    if (removeImageBtn) {
        removeImageBtn.onclick = () => {
            if (fileInput) fileInput.value = '';
            if (cameraInput) cameraInput.value = '';
            imagePreview.src = '';
            if (previewArea) previewArea.style.display = 'none';
            if (uploadArea) uploadArea.style.display = 'flex';
        };
    }

    if (newScanBtn) {
        newScanBtn.onclick = () => {
            if (resultsSection) resultsSection.style.display = 'none';
            if (uploadArea) uploadArea.style.display = 'flex';
            if (fileInput) fileInput.value = '';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
    }

    // Navigation & Sidebar
    if (menuBtn) menuBtn.onclick = () => sidebar.classList.add('active');
    if (closeSidebar) closeSidebar.onclick = () => sidebar.classList.remove('active');

    navLinks.forEach(link => {
        link.onclick = () => {
            const viewId = link.getAttribute('data-view');
            viewSections.forEach(v => v.style.display = 'none');
            const target = getEl(viewId);
            if (target) target.style.display = 'block';
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            if (window.innerWidth <= 768) sidebar.classList.remove('active');
        };
    });

    if (heroStartBtn) {
        heroStartBtn.onclick = () => {
            uploadArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
    }

    // --- Community Posting Logic ---
    const communityPostInput = getEl('communityPostInput');
    const communityFileInput = getEl('communityFileInput');
    const attachImageBtn = getEl('attachImageBtn');
    const submitPostBtn = getEl('submitPostBtn');
    const communityFeed = getEl('communityFeed');
    
    let currentPostImage = null;

    if (attachImageBtn && communityFileInput) {
        attachImageBtn.onclick = () => communityFileInput.click();
        communityFileInput.onchange = function () {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    currentPostImage = e.target.result;
                    attachImageBtn.style.color = 'var(--primary-color)'; // visual feedback that image is attached
                };
                reader.readAsDataURL(this.files[0]);
            }
        };
    }

    function renderPosts() {
        if (!communityFeed) return;
        communityFeed.innerHTML = '';
        const posts = JSON.parse(localStorage.getItem('agritech_community_posts') || '[]');
        
        posts.forEach(post => {
            const postEl = document.createElement('div');
            postEl.className = 'glass-card activity-item';
            postEl.style.flexDirection = 'column';
            postEl.style.alignItems = 'flex-start';
            
            let imgHTML = post.image ? `<img src="${post.image}" style="max-width: 100%; border-radius: 8px; margin-top: 12px; object-fit: contain; max-height: 300px;">` : '';
            
            postEl.innerHTML = `
                <div style="display: flex; align-items: center; width: 100%;">
                    <div class="item-img" style="border-radius: 50%;"><i class="fa-solid fa-user"></i></div>
                    <div class="item-details">
                        <h4>Farmer</h4>
                        <p>${post.date}</p>
                    </div>
                </div>
                <div style="margin-top: 12px; width: 100%;">
                    <p style="color: var(--text-main); font-size: 15px; white-space: pre-wrap;">${post.text}</p>
                    ${imgHTML}
                </div>
            `;
            communityFeed.appendChild(postEl);
        });
    }

    if (submitPostBtn && communityPostInput) {
        submitPostBtn.onclick = () => {
            const text = communityPostInput.value.trim();
            if (!text && !currentPostImage) return;

            const posts = JSON.parse(localStorage.getItem('agritech_community_posts') || '[]');
            posts.unshift({
                text: text,
                image: currentPostImage,
                date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString()
            });
            localStorage.setItem('agritech_community_posts', JSON.stringify(posts));
            
            // Clear inputs
            communityPostInput.value = '';
            if(communityFileInput) communityFileInput.value = '';
            currentPostImage = null;
            attachImageBtn.style.color = '';
            
            renderPosts();

            // Success notification
            const notif = document.createElement('div');
            notif.textContent = 'Post submitted successfully!';
            notif.style.position = 'fixed';
            notif.style.bottom = '24px';
            notif.style.left = '50%';
            notif.style.transform = 'translateX(-50%)';
            notif.style.background = 'var(--primary-color)';
            notif.style.color = 'white';
            notif.style.padding = '12px 24px';
            notif.style.borderRadius = '8px';
            notif.style.zIndex = '2000';
            notif.style.boxShadow = '0 4px 14px rgba(46, 125, 50, 0.4)';
            notif.style.fontWeight = '600';
            document.body.appendChild(notif);
            
            setTimeout(() => notif.remove(), 3000);
        };
        
        // Initial render
        renderPosts();
    }

    console.log("AgriTech: Initialized successfully.");
};

// Start the app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// --- Chatbot Component Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('chatbot-toggle-btn');
    const closeBtn = document.getElementById('close-chat-btn');
    const chatWindow = document.getElementById('agritech-chat-window');
    const sendBtn = document.getElementById('send-msg-btn');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');

    if (!toggleBtn || !chatWindow) return; // Guard clause if elements don't exist

    // Toggle chat window visibility
    toggleBtn.addEventListener('click', () => {
        const isOpen = chatWindow.classList.contains('open');
        if (isOpen) {
            chatWindow.classList.remove('open');
        } else {
            chatWindow.classList.add('open');
            chatInput.focus();
        }
    });

    closeBtn.addEventListener('click', () => {
        chatWindow.classList.remove('open');
    });

    // Handle sending message
    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        // Add user message to UI
        const userMsg = document.createElement('div');
        userMsg.className = 'message user-message';
        userMsg.textContent = text;
        chatMessages.appendChild(userMsg);
        
        // Clear input and scroll to bottom
        chatInput.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Dynamic AI Response Logic
        setTimeout(() => {
            const botMsg = document.createElement('div');
            botMsg.className = 'message bot-message';
            
            const lowerText = text.toLowerCase();
            let response = "I'm still learning about that specific topic. Can I help you with crop disease detection or using the community portal?";
            
            if (lowerText.includes('upload') && lowerText.includes('image')) {
                response = 'You can upload a plant photo by clicking the "Gallery" or "Camera" buttons in the "New Detection" section on your dashboard.';
            } else if (lowerText.includes('upload') || lowerText.includes('photo') || lowerText.includes('picture')) {
                response = 'You can upload a plant photo by clicking the "Gallery" or "Camera" buttons in the "New Detection" section on your dashboard.';
            } else if (lowerText.includes('detect') || lowerText.includes('disease')) {
                response = 'To detect a disease, upload a clear photo of the affected plant leaf using the dashboard tools. Our AI will analyze it and provide treatment recommendations.';
            } else if (lowerText.includes('community') || lowerText.includes('forum')) {
                response = 'You can share experiences or ask questions in our Farmer Community. Go to the "Community" tab on the left sidebar to start interacting!';
            } else if (lowerText.includes('hi') || lowerText.includes('hello')) {
                response = 'Hello there! I am your AgriTech Assistant. How can I help you with your crops today?';
            }

            botMsg.textContent = response;
            chatMessages.appendChild(botMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 1000);
    }

    sendBtn.addEventListener('click', sendMessage);

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
});
