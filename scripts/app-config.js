// Centralized app configuration for PlebDashboard-LN
document.addEventListener('DOMContentLoaded', () => {
    if (typeof BitcoinLabsApp !== 'undefined') {
        BitcoinLabsApp.init({
            isApp: true,
            appName: "plebdashboard-ln",
            appHomeUrl: "https://sorukumar.github.io/plebdashboard-ln/",
            navLinks: [
                { name: 'Home', url: 'index.html' },
                { name: 'Node Rankings', url: 'prank.html' },
                { name: 'Node Explorer', url: 'node-explorer.html' },
                { name: 'Channel Explorer', url: 'channel-explorer.html' },
                { name: 'Comparison', url: 'node-comparison.html' }
            ]
        });
    } else {
        console.error("BitcoinLabsApp is not defined. Ensure app-components.js is loaded.");
    }

    // Initialize search clear buttons globally
    const setupClearButtons = () => {
        const searchInputs = document.querySelectorAll('.search-input, .search-input-hero');
        searchInputs.forEach(input => {
            const container = input.closest('.search-container, .search-input-container');
            if (!container) return;
            const clearBtn = container.querySelector('.search-clear-btn');
            if (!clearBtn) return;

            // Toggle visibility on input
            input.addEventListener('input', () => {
                if (input.value.length > 0) {
                    clearBtn.classList.add('visible');
                    input.classList.add('has-value');
                } else {
                    clearBtn.classList.remove('visible');
                    input.classList.remove('has-value');
                }
            });

            // Clear on click
            clearBtn.addEventListener('click', () => {
                input.value = '';
                clearBtn.classList.remove('visible');
                input.classList.remove('has-value');
                input.focus();
                // Trigger input event so active page scripts update
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });

            // Set initial state if browser auto-filled or populated via URL params
            if (input.value.length > 0) {
                clearBtn.classList.add('visible');
                input.classList.add('has-value');
            }
        });
    };
    
    // Slight delay to ensure DOM and other frameworks are fully ready
    setTimeout(setupClearButtons, 100);
});
