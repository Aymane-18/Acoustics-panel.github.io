// Update wall input logic to include absorber checkboxes
const wallInputHandler = document.getElementById('num_walls');
const wallContainer = document.getElementById('wall-inputs');
const absorberWallSelector = document.getElementById('absorber-wall-options');

wallInputHandler.addEventListener('change', function () {
    wallContainer.innerHTML = '';
    absorberWallSelector.innerHTML = '';
    const n = parseInt(this.value);
    for (let i = 0; i < n; i++) {
        wallContainer.innerHTML += `
            <div class="wall-group">
                <label>Wall ${i + 1} - Width (m):</label>
                <input type="number" class="wall-width" step="0.01" required>
                <label>Wall ${i + 1} - Height (m):</label>
                <input type="number" class="wall-height" step="0.01" required>
                <label>Wall ${i + 1} - Material:</label>
                <select class="wall-material">
                    <option value="drywall">Drywall</option>
                    <option value="concrete">Concrete</option>
                    <option value="glass">Glass</option>
                </select>
            </div>
        `;
        absorberWallSelector.innerHTML += `
            <div>
                <input type="checkbox" class="absorber-wall-checkbox" value="${i}" checked>
                <label>Wall ${i + 1}</label>
            </div>
        `;
    }
});

// Rest of the script logic
const absorptionCoefficients = {
    drywall: [0.29, 0.10, 0.05, 0.04, 0.07, 0.09],
    concrete: [0.36, 0.44, 0.31, 0.29, 0.39, 0.25],
    glass: [0.18, 0.06, 0.04, 0.03, 0.02, 0.02],
    steel: [0.02, 0.04, 0.05, 0.06, 0.07, 0.08],
    fiberglass: {
        25: [0.10, 0.35, 0.55, 0.65, 0.75, 0.80],
        50: [0.20, 0.50, 0.70, 0.80, 0.75, 0.80],
        100: [0.25, 0.60, 0.80, 0.85, 0.80, 0.80]
    },
    mineral_wool: {
        25: [0.30, 0.60, 0.75, 0.85, 0.90, 0.95],
        50: [0.50, 0.75, 0.85, 0.90, 0.95, 0.95],
        100: [0.70, 0.85, 0.90, 0.95, 0.95, 0.95]
    },
    polyester: {
        10: [0.05, 0.10, 0.30, 0.50, 0.70, 0.80],
        25: [0.10, 0.30, 0.60, 0.80, 0.90, 0.95],
        50: [0.20, 0.50, 0.80, 0.90, 0.95, 0.95]
    },
    foam: {
        25: [0.10, 0.30, 0.60, 0.75, 0.85, 0.90],
        50: [0.25, 0.55, 0.80, 0.90, 0.95, 0.95],
        100: [0.45, 0.75, 0.90, 0.95, 0.95, 0.95]
    }
};

const frequencies = [125, 250, 500, 1000, 2000, 4000];

// Main acoustic calculation handler
const form = document.getElementById('acoustic-form');
form.addEventListener('submit', function (event) {
    event.preventDefault();

    const wallWidths = [...document.querySelectorAll('.wall-width')].map(el => parseFloat(el.value));
    const wallHeights = [...document.querySelectorAll('.wall-height')].map(el => parseFloat(el.value));
    const wallMaterials = [...document.querySelectorAll('.wall-material')].map(el => el.value);
    const absorberWallIndices = [...document.querySelectorAll('.absorber-wall-checkbox')]
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));

    const floorArea = parseFloat(document.getElementById('floor_area').value);
    const ceilingArea = floorArea;
    const Sz = floorArea + ceilingArea;
    const avgWallHeight = wallHeights.reduce((a, b) => a + b, 0) / wallHeights.length;
    const volume = floorArea * avgWallHeight;

    // Area by material
    const areaByMaterial = { drywall: 0, concrete: 0, glass: 0 };
    const wallAreas = wallWidths.map((w, i) => w * wallHeights[i]);

    wallAreas.forEach((area, i) => {
        areaByMaterial[wallMaterials[i]] += area;
    });

    const alpha_ceiling = frequencies.map((_, i) => (absorptionCoefficients.concrete[i] + absorptionCoefficients.steel[i]) / 2);
    const Swalls = wallAreas.reduce((a, b) => a + b, 0);
    const totalSurfaceArea = Swalls + Sz;

    const alpha_selected_material = document.getElementById('material').value;
    const panel_thickness = parseInt(document.getElementById('thickness').value);
    const panel_percent = parseFloat(document.getElementById('percentage_area').value);
    const alpha_panel = absorptionCoefficients[alpha_selected_material][panel_thickness];

    const alpha_wall = frequencies.map((_, i) => {
        const totalWallArea = areaByMaterial.drywall + areaByMaterial.concrete + areaByMaterial.glass;
        const weighted = (
            areaByMaterial.drywall * absorptionCoefficients.drywall[i] +
            areaByMaterial.concrete * absorptionCoefficients.concrete[i] +
            areaByMaterial.glass * absorptionCoefficients.glass[i]
        ) / totalWallArea;
        return weighted;
    });

    const A_baseline = frequencies.map((_, i) =>
        Swalls * alpha_wall[i] + Sz * alpha_ceiling[i]
    );
    const absorber_area = absorberWallIndices
        .map(i => wallWidths[i] * wallHeights[i])
        .reduce((a, b) => a + b, 0) * (panel_percent / 100);

    const A_modified = frequencies.map((_, i) =>
        A_baseline[i] + absorber_area * (alpha_panel[i] - alpha_wall[i])
    );

    const RT60_baseline = A_baseline.map(A => 0.161 * volume / A);
    const RT60_new = A_modified.map(A => 0.161 * volume / A);

    const ctx = document.getElementById('rt60-chart').getContext('2d');
    if (window.rt60Chart) window.rt60Chart.destroy();
    window.rt60Chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: frequencies,
            datasets: [
                {
                    label: 'Sabine: Baseline',
                    data: RT60_baseline,
                    borderColor: '#3e95cd',
                    backgroundColor: 'rgba(62, 149, 205, 0.2)',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: `Sabine: ${panel_percent}% on selected walls`,
                    data: RT60_new,
                    borderColor: '#8e5ea2',
                    backgroundColor: 'rgba(142, 94, 162, 0.2)',
                    fill: false,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'logarithmic',
                    title: { display: true, text: 'Frequency (Hz)' }
                },
                y: {
                    title: { display: true, text: 'RT60 (s)' }
                }
            },
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    const recommendation = document.getElementById('recommendation');
    const belowThreshold = RT60_new.every(v => v < 1.7);
    if (belowThreshold) {
        recommendation.textContent = `✅ This configuration reduces RT60 below 1.7s at all frequencies.`;
    } else {
        recommendation.textContent = `⚠️ RT60 still exceeds 1.7s at some frequencies. Try increasing coverage or using thicker panels.`;
    }
});

window.addEventListener('DOMContentLoaded', () => {
    wallInputHandler.dispatchEvent(new Event('change'));
});
