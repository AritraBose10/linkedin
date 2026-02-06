/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./popup/**/*.{html,js}", "./options/**/*.{html,js}"],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                primary: "#0073b1",
                "background-light": "#F9FAFB",
                "background-dark": "#111827",
                "card-light": "#FFFFFF",
                "card-dark": "#1F2937",
            },
            fontFamily: {
                display: ["Inter", "sans-serif"],
                sans: ["Inter", "sans-serif"],
            },
            borderRadius: {
                DEFAULT: "12px",
                "xl": "16px",
                "2xl": "20px",
            },
            boxShadow: {
                'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
                'glow': '0 0 15px rgba(0, 115, 177, 0.3)',
            }
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
        require('@tailwindcss/forms'),
    ],
}
