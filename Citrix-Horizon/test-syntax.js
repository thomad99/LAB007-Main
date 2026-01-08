// Simple syntax test for dashboard.js
const fs = require('fs');

try {
    const content = fs.readFileSync('./Web/dashboard.js', 'utf-8');

    // Check for basic syntax issues
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;

    console.log(`Braces: ${openBraces} open, ${closeBraces} close`);
    console.log(`Parens: ${openParens} open, ${closeParens} close`);

    if (openBraces === closeBraces && openParens === closeParens) {
        console.log('✓ Basic syntax check passed');
    } else {
        console.log('✗ Syntax issues detected');
        console.log(`Brace mismatch: ${openBraces - closeBraces}`);
        console.log(`Paren mismatch: ${openParens - closeParens}`);
    }

} catch (error) {
    console.error('Error reading file:', error.message);
}