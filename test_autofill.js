
import PuppeteerFormChecker from './resources/js/puppeteer-form-checker.js';
import path from 'path';

const checker = new PuppeteerFormChecker();
const formPath = 'file://' + path.resolve('test_form.html');

const config = {
    url: formPath,
    selectorType: 'css',
    selectorValue: '#contact-form',
    fieldMappings: [], // Empty mappings to trigger auto-fill
    successSelector: '.success-message',
    timeout: 10000
};

console.log('Testing Auto-Fill on:', formPath);

checker.initialize().then(async () => {
    const result = await checker.checkForm(config);
    console.log('Result:', JSON.stringify(result, null, 2));
    await checker.cleanup();
}).catch(console.error);
