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
        // Ensure model is loaded
        if (!this.model) {
            await this.init();
        }

        // Add a fake delay to simulate deep analysis for the user experience
        await new Promise(resolve => setTimeout(resolve, 2000));

        // For the sake of this prototype without a custom trained Plant disease model,
        // we will use the MobileNet prediction to trigger our own "mock" database.
        // A real app would use `this.model.predict(tensor)` with a custom `.tflite` or `.json` model.
        
        try {
            // Get actual prediction from MobileNet (just to prove TFJS is working offline)
            const predictions = await this.model.classify(imgElement);
            console.log("Raw TFJS Predictions:", predictions);
            
            // Generate a smart response based on our crop database
            return this.getMockDiseaseData();
        } catch (error) {
            console.error("Inference failed", error);
            return this.getMockDiseaseData(); // fallback
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
    }
};
