import tensorflow as tf
from tensorflow.keras import layers, models
import os

def create_dummy_model():
    print("Creating a dummy MobileNet-like model for testing...")
    
    model = models.Sequential([
        layers.Input(shape=(224, 224, 3)),
        layers.Conv2D(32, (3, 3), activation='relu'),
        layers.MaxPooling2D((2, 2)),
        layers.Flatten(),
        layers.Dense(64, activation='relu'),
        layers.Dense(4, activation='softmax') # 4 classes: Healthy, Late Blight, Leaf Spot, Powdery Mildew
    ])

    model.compile(optimizer='adam',
                  loss='categorical_crossentropy',
                  metrics=['accuracy'])

    model_path = 'model.h5'
    model.save(model_path)
    print(f"Dummy model saved to {os.path.abspath(model_path)}")

if __name__ == "__main__":
    create_dummy_model()
