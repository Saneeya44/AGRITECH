/**
 * Machine Learning Service for AgriTech Web App
 * Uses TensorFlow.js to run models offline in the browser.
 */

window.MLService = {
    model: null,
    isInitializing: false,

    async init() {
        if (this.model || this.isInitializing) return;
        this.isInitializing = true;
        
        try {
            console.log("Loading MobileNet model for offline AI...");
            // We load MobileNet as a base model for feature extraction/demo
            // In a real scenario, this would load a custom retrained model: 
            // await tf.loadGraphModel('model/model.json');
            this.model = await mobilenet.load({version: 2, alpha: 1.0});
            console.log("Model loaded successfully.");
        } catch (error) {
            console.error("Failed to load model:", error);
        }
        this.isInitializing = false;
    },

    async predict(imgElement) {
        // First try remote backend if available
        try {
            return await this.predictRemote(imgElement);
        } catch (error) {
            console.warn("Remote backend unavailable, falling back to local TFJS model.", error);
            return this.predictLocal(imgElement);
        }
    },

    async predictRemote(imgElement) {
        console.log("MLService: Attempting remote prediction...");

        // Guard: image must be loaded before we can draw it
        const naturalW = imgElement.naturalWidth  || imgElement.width  || 0;
        const naturalH = imgElement.naturalHeight || imgElement.height || 0;
        if (naturalW === 0 || naturalH === 0) {
            throw new Error('Image element has zero dimensions — not yet loaded.');
        }

        // Draw a downscaled copy for faster transfer
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d');
        const MAX_SIZE = 800;
        let w = naturalW, h = naturalH;
        if (w > MAX_SIZE || h > MAX_SIZE) {
            if (w > h) { h = Math.round(h * MAX_SIZE / w); w = MAX_SIZE; }
            else       { w = Math.round(w * MAX_SIZE / h); h = MAX_SIZE; }
        }
        canvas.width  = w;
        canvas.height = h;
        ctx.drawImage(imgElement, 0, 0, w, h);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob failed')),
                          'image/jpeg', 0.85);
        });

        const formData = new FormData();
        formData.append('file', blob, 'plant_scan.jpg');

        console.log(`MLService: Sending ${(blob.size / 1024).toFixed(1)} KB to backend...`);

        const response = await fetch('http://localhost:5000/predict', {
            method: 'POST',
            body:   formData,
            signal: AbortSignal.timeout(30000) // 30s — TF model needs warm-up time
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => response.statusText);
            throw new Error(`Backend error ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        console.log("MLService: Remote prediction success:", data);

        return {
            disease:           this.mapToKey(data.disease),
            plantName:         data.plant_type || "Detected Plant",
            confidence:        data.confidence,
            symptoms:          this.mapToKey(data.disease) + "_symptoms",
            causes:            this.mapToKey(data.disease) + "_causes",
            organicTreatment:  this.mapToKey(data.disease) + "_organic",
            chemicalTreatment: this.mapToKey(data.disease) + "_chemical",
            prevention:        this.mapToKey(data.disease) + "_prevention",
            remedy:            data.remedy
        };
    },

    mapToKey(name) {
        const map = {
            'Late Blight': 'disease_late_blight',
            'Powdery Mildew': 'disease_powdery_mildew',
            'Leaf Spot': 'disease_leaf_spot',
            'Healthy': 'disease_healthy'
        };
        return map[name] || 'disease_unknown';
    },

    async predictLocal(imgElement) {
        console.log("MLService: Starting LOCAL prediction (TFJS)...");
        // Ensure model is loaded
        if (!this.model) {
            console.log("MLService: Model not loaded, initializing now...");
            await this.init();
        }

        // Add a fake delay to simulate deep analysis for the user experience
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            console.log("MLService: Classifying image with MobileNet...");
            // Get actual prediction from MobileNet
            const predictions = await this.model.classify(imgElement);
            console.log("MLService: Raw TFJS Predictions:", predictions);
            
            // Extract a likely plant name from top prediction (e.g., "daisy", "banana")
            const topPrediction = predictions[0].className.split(',')[0];
            console.log("MLService: Top detected class:", topPrediction);
            
            const diseaseData = this.getMockDiseaseData();
            console.log("MLService: Returning mock disease data with detected plant name");
            return {
                ...diseaseData,
                plantName: topPrediction.charAt(0).toUpperCase() + topPrediction.slice(1)
            };
        } catch (error) {
            console.error("MLService: Local inference failed", error);
            const diseaseData = this.getMockDiseaseData();
            return { ...diseaseData, plantName: "Plant" };
        }
    },

    // Simulated crop database
    getMockDiseaseData() {
        const diseases = [
            {
                disease: "disease_late_blight",
                confidence: 94.2,
                symptoms: "symptoms_late_blight",
                causes: "causes_late_blight",
                organicTreatment: "organic_late_blight",
                chemicalTreatment: "chemical_late_blight",
                prevention: "prevention_late_blight"
            },
            {
                disease: "disease_powdery_mildew",
                confidence: 89.5,
                symptoms: "symptoms_powdery_mildew",
                causes: "causes_powdery_mildew",
                organicTreatment: "organic_powdery_mildew",
                chemicalTreatment: "chemical_powdery_mildew",
                prevention: "prevention_powdery_mildew"
            },
            {
                disease: "disease_healthy",
                confidence: 98.8,
                symptoms: "symptoms_healthy",
                causes: "causes_healthy",
                organicTreatment: "organic_healthy",
                chemicalTreatment: "chemical_healthy",
                prevention: "prevention_healthy"
            },
            {
                disease: "disease_leaf_spot",
                confidence: 91.3,
                symptoms: "symptoms_leaf_spot",
                causes: "causes_leaf_spot",
                organicTreatment: "organic_leaf_spot",
                chemicalTreatment: "chemical_leaf_spot",
                prevention: "prevention_leaf_spot"
            }
        ];

        // Randomly select one for demo purposes
        const roll = Math.random();
        if (roll < 0.3) return diseases[0];
        if (roll < 0.6) return diseases[1];
        if (roll < 0.85) return diseases[3];
        return diseases[2];
    },

    getSeasonalRisk(weatherData) {
        if (!weatherData) return "Please allow location access for weather-based risk analysis.";
        
        const temp = weatherData.temp;
        const humidity = weatherData.humidity;
        const rain = weatherData.rainChance;
        
        let risks = [];
        
        // High Humidity + Moderate Temp = Fungal diseases like Late Blight/Mildew
        if (humidity > 80 && temp > 15 && temp < 25) {
            risks.push("High risk of Late Blight and Fungal infections. Prevention: Prune lower leaves for airflow. Medicine: Use Copper Oxychloride or Mancozeb sprays.");
        }
        
        // High Temp + High Humidity = Bacterial Wilt / Fruit Rot
        if (temp > 30 && humidity > 70) {
            risks.push("Risk of Bacterial Wilt and Fruit Rot. Prevention: Ensure proper drainage and avoid waterlogging. Medicine: Apply Streptocycline if symptoms appear.");
        }
        
        // Dry + Hot = Spider Mites / Heat Stress
        if (temp > 35 && humidity < 40) {
            risks.push("Risk of Heat Stress and Spider Mite infestation. Prevention: Increase irrigation and use mulch to retain moisture. Medicine: Spray Neem Oil for mites.");
        }
        
        // Frequent Rain = Leaf Spots / Damping Off
        if (rain > 60) {
            risks.push("Frequent rain detected. Risk of Leaf Spot and Damping Off. Prevention: Avoid over-watering and keep plant base clean. Medicine: Use Carbendazim-based fungicides.");
        }
        
        if (risks.length === 0) {
            return "Current weather conditions are stable. Continue regular monitoring and balanced fertilization.";
        }
        
        return risks.join(" ");
    }
};
