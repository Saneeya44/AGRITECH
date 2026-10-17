/**
 * WeatherService - OpenWeatherMap Integration for AgriTech
 * Handles geolocation, live weather data, caching, and farming recommendations.
 *
 * IMPORTANT: Replace 'YOUR_API_KEY_HERE' with your free key from openweathermap.org
 */

window.WeatherService = {
    API_KEY: 'YOUR_API_KEY_HERE',
    CACHE_KEY: 'agritech_weather_cache',
    CACHE_EXPIRY_MS: 15 * 60 * 1000, // 15 minutes

    async init() {
        this.renderSkeleton();
        try {
            const coords = await this.getLocation();
            const data = await this.fetchWeather(coords.lat, coords.lon);
            this.renderWeather(data);
            if (window.updateSprayingAdvisor) window.updateSprayingAdvisor(data);
            // Log to Firestore (non-blocking)
            if (window.DBService && !data.isMock) {
                DBService.weatherLogs.logWeather({
                    temp:       data.temp,
                    feelsLike:  data.feelsLike,
                    humidity:   data.humidity,
                    rainChance: data.rainChance,
                    windSpeed:  data.windSpeed,
                    city:       data.city,
                    country:    data.country,
                    condition:  data.condition,
                    description: data.description
                }).catch(e => console.warn('Weather log failed:', e));
            }
        } catch (err) {
            console.error('Weather init error:', err);
            this.renderError(err.message);
        }
    },

    getLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                return reject(new Error('Geolocation is not supported by your browser.'));
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                () => reject(new Error('Location access denied. Please allow location to see local weather.'))
            );
        });
    },

    async fetchWeather(lat, lon) {
        // Check cache first
        const cached = localStorage.getItem(this.CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < this.CACHE_EXPIRY_MS) {
                console.log('WeatherService: Serving from cache.');
                return parsed.data;
            }
        }

        if (this.API_KEY === 'YOUR_API_KEY_HERE') {
            // Return rich mock data so the UI is fully demonstrable without an API key
            return this.getMockWeatherData();
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${this.API_KEY}`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=8&appid=${this.API_KEY}`;

        const [weatherRes, forecastRes] = await Promise.all([fetch(url), fetch(forecastUrl)]);

        if (!weatherRes.ok) throw new Error('Failed to fetch weather data. Check your API key.');

        const weather = await weatherRes.json();
        const forecast = forecastRes.ok ? await forecastRes.json() : null;

        // Calculate rain probability from 24h forecast
        let rainChance = 0;
        if (forecast) {
            const rainySlots = forecast.list.filter(f => f.pop > 0.2).length;
            rainChance = Math.round((rainySlots / forecast.list.length) * 100);
        }

        const data = {
            city: weather.name,
            country: weather.sys.country,
            temp: Math.round(weather.main.temp),
            feelsLike: Math.round(weather.main.feels_like),
            humidity: weather.main.humidity,
            windSpeed: Math.round(weather.wind.speed * 3.6), // m/s to km/h
            condition: weather.weather[0].main,
            description: weather.weather[0].description,
            icon: weather.weather[0].icon,
            rainChance,
            timestamp: Date.now()
        };

        localStorage.setItem(this.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
        return data;
    },

    getMockWeatherData() {
        return {
            city: 'Your Location',
            country: 'IN',
            temp: 32,
            feelsLike: 36,
            humidity: 68,
            windSpeed: 14,
            condition: 'Clouds',
            description: 'scattered clouds',
            icon: '03d',
            rainChance: 30,
            isMock: true
        };
    },

    getFarmingAdvice(data) {
        const advice = [];
        const lang = localStorage.getItem('agritech_lang') || 'en';

        // Temperature-based advice
        if (data.temp > 38) {
            advice.push({ icon: 'fa-temperature-high', key: 'advice_extreme_heat', color: '#ef4444' });
        } else if (data.temp > 30) {
            advice.push({ icon: 'fa-droplet', key: 'advice_high_temp', color: '#f59e0b' });
        } else if (data.temp < 10) {
            advice.push({ icon: 'fa-snowflake', key: 'advice_cold', color: '#60a5fa' });
        }

        // Rain-based advice
        if (data.rainChance > 70) {
            advice.push({ icon: 'fa-cloud-showers-heavy', key: 'advice_heavy_rain', color: '#3b82f6' });
        } else if (data.rainChance > 40) {
            advice.push({ icon: 'fa-cloud-rain', key: 'advice_light_rain', color: '#60a5fa' });
        } else if (data.humidity < 35) {
            advice.push({ icon: 'fa-sun', key: 'advice_irrigate', color: '#f59e0b' });
        }

        // Wind-based advice
        if (data.windSpeed > 30) {
            advice.push({ icon: 'fa-wind', key: 'advice_high_wind', color: '#a78bfa' });
        }

        // Good day
        if (advice.length === 0) {
            advice.push({ icon: 'fa-check-circle', key: 'advice_good_day', color: '#10b981' });
        }

        return advice.slice(0, 3); // max 3 tips
    },

    getWeatherIcon(condition) {
        const map = {
            'Clear': { icon: 'fa-sun', color: '#fbbf24' },
            'Clouds': { icon: 'fa-cloud', color: '#94a3b8' },
            'Rain': { icon: 'fa-cloud-rain', color: '#60a5fa' },
            'Drizzle': { icon: 'fa-cloud-drizzle', color: '#7dd3fc' },
            'Thunderstorm': { icon: 'fa-bolt', color: '#a78bfa' },
            'Snow': { icon: 'fa-snowflake', color: '#bae6fd' },
            'Mist': { icon: 'fa-smog', color: '#9ca3af' },
            'Smoke': { icon: 'fa-smog', color: '#9ca3af' },
            'Haze': { icon: 'fa-smog', color: '#9ca3af' },
        };
        return map[condition] || { icon: 'fa-cloud-sun', color: '#94a3b8' };
    },

    renderSkeleton() {
        const section = document.getElementById('weatherSection');
        if (!section) return;
        section.innerHTML = `
            <div class="weather-header">
                <div class="skeleton skeleton-text" style="width:180px;height:24px;border-radius:6px;"></div>
                <div class="skeleton skeleton-text" style="width:100px;height:16px;border-radius:6px;margin-top:6px;"></div>
            </div>
            <div class="weather-cards-grid">
                ${[1,2,3,4].map(() => `<div class="skeleton" style="height:140px;border-radius:16px;"></div>`).join('')}
            </div>
        `;
    },

    renderWeather(data) {
        const section = document.getElementById('weatherSection');
        if (!section) return;

        const lang = localStorage.getItem('agritech_lang') || 'en';
        const t = (key) => window.getTranslation ? window.getTranslation(lang, key) : key;
        const weatherIcon = this.getWeatherIcon(data.condition);
        const advice = this.getFarmingAdvice(data);

        section.innerHTML = `
            <div class="weather-header">
                <div class="weather-location">
                    <i class="fa-solid fa-location-dot" style="color:var(--primary-color)"></i>
                    <span id="weatherLocationName">${data.city}${data.country ? ', ' + data.country : ''}</span>
                    ${data.isMock ? '<span class="mock-badge">Demo Mode — Add API Key</span>' : ''}
                </div>
                <p class="weather-subtitle" id="weatherConditionText" style="text-transform:capitalize;">${data.description}</p>
            </div>

            <div class="weather-cards-grid">
                <!-- Temperature Card -->
                <div class="weather-card weather-card--temp" style="animation-delay:0s">
                    <div class="weather-card-icon">
                        <i class="fa-solid ${weatherIcon.icon}" style="color:${weatherIcon.color}"></i>
                    </div>
                    <div class="weather-card-value">${data.temp}°C</div>
                    <div class="weather-card-label" data-i18n="weather_temp">${t('weather_temp')}</div>
                    <div class="weather-card-sub">${t('weather_feels_like')} ${data.feelsLike}°C</div>
                </div>

                <!-- Humidity Card -->
                <div class="weather-card weather-card--humidity" style="animation-delay:0.15s">
                    <div class="weather-card-icon">
                        <i class="fa-solid fa-droplet" style="color:#60a5fa"></i>
                    </div>
                    <div class="weather-card-value">${data.humidity}%</div>
                    <div class="weather-card-label" data-i18n="weather_humidity">${t('weather_humidity')}</div>
                    <div class="weather-card-sub">${data.humidity > 70 ? '🌿 High' : data.humidity < 35 ? '🏜️ Low' : '✅ Optimal'}</div>
                </div>

                <!-- Rain Chance Card -->
                <div class="weather-card weather-card--rain" style="animation-delay:0.3s">
                    <div class="weather-card-icon">
                        <i class="fa-solid fa-cloud-rain" style="color:#7dd3fc"></i>
                    </div>
                    <div class="weather-card-value">${data.rainChance}%</div>
                    <div class="weather-card-label" data-i18n="weather_rain">${t('weather_rain')}</div>
                    <div class="weather-card-sub">${data.rainChance > 60 ? '⚠️ Likely' : data.rainChance > 30 ? '🌦️ Possible' : '☀️ Unlikely'}</div>
                </div>

                <!-- Wind Speed Card -->
                <div class="weather-card weather-card--wind" style="animation-delay:0.45s">
                    <div class="weather-card-icon">
                        <i class="fa-solid fa-wind" style="color:#a78bfa"></i>
                    </div>
                    <div class="weather-card-value">${data.windSpeed} <span style="font-size:16px">km/h</span></div>
                    <div class="weather-card-label" data-i18n="weather_wind">${t('weather_wind')}</div>
                    <div class="weather-card-sub">${data.windSpeed > 30 ? '💨 Strong' : data.windSpeed > 15 ? '🍃 Moderate' : '🌿 Calm'}</div>
                </div>
            </div>

            <!-- Farming Advice -->
            <div class="farming-advice-card glass-card">
                <div class="farming-advice-header">
                    <i class="fa-solid fa-seedling" style="color:var(--primary-color)"></i>
                    <h3 data-i18n="farming_advice_title">${t('farming_advice_title')}</h3>
                </div>
                <div class="farming-advice-list">
                    ${advice.map(tip => `
                        <div class="farming-tip">
                            <div class="tip-icon" style="background:${tip.color}22; color:${tip.color}">
                                <i class="fa-solid ${tip.icon}"></i>
                            </div>
                            <p data-i18n="${tip.key}">${t(tip.key)}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    renderError(message) {
        const section = document.getElementById('weatherSection');
        if (!section) return;
        section.innerHTML = `
            <div class="weather-error glass-card">
                <i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);font-size:32px"></i>
                <p>${message}</p>
                <button class="btn secondary-btn" onclick="window.WeatherService.init()">
                    <i class="fa-solid fa-rotate"></i> Retry
                </button>
            </div>
        `;
    }
};
