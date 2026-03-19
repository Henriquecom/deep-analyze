# deep-analyze

Use this to analyze your HTML code.

Focus on one element, and both CSS and JavaScript will be logged. 
CSS comes with all variables "solved" (replaced with original values). 
Parent CSS rules are also included.

JavaScript is filtered to show only code that probably changes the element.



# use

if you have the problem :


>[!CAUTION]
>Uncaught ReferenceError: $0 is not defined at

try using:
```javascript
const a = $0;
fetch('https://raw.githubusercontent.com/Henriquecom/deep-analyze/refs/heads/main/code.js').then(r=>r.text()).then(c=>eval(c.replace(/\$0/g, 'a')))
```
