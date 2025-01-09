export function randomHexColorWithWhiteText(): string {
    // Function to calculate contrast ratio
    const contrastRatio = (l1: number, l2: number): number => {
        return (l1 + 0.05) / (l2 + 0.05);
    };

    // Function to calculate relative luminance
    const relativeLuminance = (r: number, g: number, b: number): number => {
        const rgb = [r, g, b].map((c) => {
            const value = c / 255;
            return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };

    while (true) {
        // Generate random RGB values
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);

        // Calculate relative luminance for the generated color
        const bgLuminance = relativeLuminance(r, g, b);
        const whiteLuminance = relativeLuminance(255, 255, 255);

        // Check if the contrast ratio is sufficient
        if (contrastRatio(whiteLuminance, bgLuminance) >= 4.5) {
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
    }
}
