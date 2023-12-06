window.onload = function() {
    const apiKeyForm = document.getElementById('apiKeyForm');
    const apiKeyInput = document.getElementById('apiKey');
    let openAIKey = localStorage.getItem('openAIKey'); // Get the key from local storage

    if (openAIKey) {
        apiKeyInput.value = openAIKey; // Set the input field value
    }

    apiKeyForm.addEventListener('submit', function(event) {
        event.preventDefault();
        openAIKey = apiKeyInput.value;
        localStorage.setItem('openAIKey', openAIKey); // Store key in local storage
        apiKeyInput.value = openAIKey; // Reset the input field value to keep it visible
        document.getElementById('apiKeyOverlay').classList.add('hidden'); // Hide overlay
    });

    document.getElementById('takePhoto').addEventListener('click', function() {
        navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
            const video = document.createElement('video');
            video.srcObject = stream;
            video.play();

            setTimeout(() => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0);
                const imageData = canvas.toDataURL('image/jpeg');
                processImage(imageData.split(',')[1]);

                stream.getTracks().forEach(track => track.stop());
            }, 3000);
        })
        .catch(err => {
            console.error("Error accessing camera:", err);
        });
    });

    document.getElementById('uploadPhoto').addEventListener('change', function(event) {
        const file = event.target.files[0];
        const reader = new FileReader();
        reader.onloadend = function() {
            processImage(reader.result.split(',')[1]);
        }
        reader.readAsDataURL(file);
    });

    function processImage(imageBase64) {
        showSpinner(true);
        const gpt4VisionAPI = 'https://api.openai.com/v1/chat/completions';
        const prompt = "Extract the following wine label information: fixed acidity, volatile acidity, citric acid, residual sugar, chlorides, free sulfur dioxide, total sulfur dioxide, pH, sulphates, alcohol content. Make sure the extracted values make sense and vary from wine label to wine label. Give a reasonable value for the label information if it is not present. Return the values you give in the pattern 'fixed acidity: 0.00, volatile acidity: 0.00, citric acid: 0.00, residual sugar: 0.00, chlorides: 0.00, free sulfur dioxide: 0.00, total sulfur dioxide: 0.00, pH: 0.00, sulphates: 0.00, alcohol: 0.00 but with the values you determined/found. That format should be in all of your responses so that it can be extracted with a regex pattern'";

        const payload = {
            model: "gpt-4-vision-preview",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { "url": `data:image/jpeg;base64,${imageBase64}` } }
                    ]
                }
            ],
            max_tokens: 300
        };

        fetch(gpt4VisionAPI, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('openAIKey')}` // Use the key from local storage
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            console.log(response); // Log the raw API response
            return response.json();
        })
        .then(data => {
            console.log(data.choices[0]); // Log the first choice
            const predictors = extractPredictors(data.choices[0].message.content);
            const density = calculateDensity(predictors);
            const quality = calculateQuality(predictors, density);
            displayResults(density, quality);
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error processing image.');
        })
        .finally(() => {
            showSpinner(false);
        });
    }

    function extractPredictors(text) {
        const predictors = {
            fixedAcidity: 0, volatileAcidity: 0, citricAcid: 0,
            residualSugar: 0, chlorides: 0, freeSulfurDioxide: 0,
            totalSulfurDioxide: 0, pH: 0, sulphates: 0, alcohol: 0
        };

        // Regex patterns for each predictor.
        const regexPatterns = {
            fixedAcidity: /fixed acidity: (\d+(\.\d+)?)/i,
            volatileAcidity: /volatile acidity: (\d+(\.\d+)?)/i,
            citricAcid: /citric acid: (\d+(\.\d+)?)/i,
            residualSugar: /residual sugar: (\d+(\.\d+)?)/i,
            chlorides: /chlorides: (\d+(\.\d+)?)/i,
            freeSulfurDioxide: /free sulfur dioxide: (\d+(\.\d+)?)/i,
            totalSulfurDioxide: /total sulfur dioxide: (\d+(\.\d+)?)/i,
            pH: /pH: (\d+(\.\d+)?)/i,
            sulphates: /sulphates: (\d+(\.\d+)?)/i,
            alcohol: /alcohol: (\d+(\.\d+)?)/i
        };

        // Extract and update predictor values
        for (const key in regexPatterns) {
            const match = text.match(regexPatterns[key]);
            if (match) {
                predictors[key] = parseFloat(match[1]);
            }
        }

        return predictors;
    }


    function calculateDensity(predictors) {
        const coefficients = {
            intercept: 9.857e-01, fixedAcidity: 7.708e-04, volatileAcidity: 6.332e-04,
            citricAcid: 3.396e-04, residualSugar: 3.716e-04, chlorides: 4.693e-03,
            freeSulfurDioxide: -6.883e-06, totalSulfurDioxide: 3.886e-06,
            pH: 3.468e-03, sulphates: 1.412e-03, alcohol: -1.126e-03
        };

        return coefficients.intercept +
            predictors.fixedAcidity * coefficients.fixedAcidity +
            predictors.volatileAcidity * coefficients.volatileAcidity +
            predictors.citricAcid * coefficients.citricAcid +
            predictors.residualSugar * coefficients.residualSugar +
            predictors.chlorides * coefficients.chlorides +
            predictors.freeSulfurDioxide * coefficients.freeSulfurDioxide +
            predictors.totalSulfurDioxide * coefficients.totalSulfurDioxide +
            predictors.pH * coefficients.pH +
            predictors.sulphates * coefficients.sulphates +
            predictors.alcohol * coefficients.alcohol;
    }

    function calculateQuality(predictors, density) {
        const coefficients = {
            intercept: 1.502e+02, fixedAcidity: 6.552e-02, volatileAcidity: -1.863e+00,
            citricAcid: 2.209e-02, residualSugar: 8.148e-02, chlorides: -2.473e-01,
            freeSulfurDioxide: 3.733e-03, totalSulfurDioxide: -2.857e-04,
            density: -1.503e+02, pH: 6.863e-01, sulphates: 6.315e-01, alcohol: 1.935e-01
        };

        return coefficients.intercept +
            predictors.fixedAcidity * coefficients.fixedAcidity +
            predictors.volatileAcidity * coefficients.volatileAcidity +
            predictors.citricAcid * coefficients.citricAcid +
            predictors.residualSugar * coefficients.residualSugar +
            predictors.chlorides * coefficients.chlorides +
            predictors.freeSulfurDioxide * coefficients.freeSulfurDioxide +
            predictors.totalSulfurDioxide * coefficients.totalSulfurDioxide +
            density * coefficients.density +
            predictors.pH * coefficients.pH +
            predictors.sulphates * coefficients.sulphates +
            predictors.alcohol * coefficients.alcohol;
    }

    function displayResults(density, quality) {
        document.getElementById('densityResult').textContent = density.toFixed(3);
        document.getElementById('qualityResult').textContent = quality.toFixed(3);
        document.getElementById('results').classList.remove('hidden');
    }

    function showSpinner(show) {
        const spinnerOverlay = document.getElementById('spinnerOverlay');
        if (show) {
            spinnerOverlay.classList.remove('hidden');
        } else {
            spinnerOverlay.classList.add('hidden');
        }
    }
};
