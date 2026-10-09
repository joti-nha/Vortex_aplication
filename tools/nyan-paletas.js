const s = require('fs').readFileSync(process.argv[2], 'utf8');
const a = s.indexOf('const NYAN_VARIANTS = ['); const b = s.indexOf('];', a);
const arr = eval(s.slice(a + 'const NYAN_VARIANTS = '.length, b + 1));
console.log(JSON.stringify(arr));
