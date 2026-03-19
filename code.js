let el = $0;
if (!el) {
  console.error('you need to select a element')
} else {

const startTime = performance.now();

let output = [];
let uniqueLines = new Set();
let relatedElements = new Set();
let relationships = [];

function resolveCSSVariables(cssText) {
  const varRegex = /var\(--[^,)]+(?:,[^)]+)?\)/g;
  const matches = cssText.match(varRegex);
  
  if (!matches) return cssText;
  
  let resolvedText = cssText;
  const computedStyle = getComputedStyle(document.documentElement);
  
  matches.forEach(match => {
    const innerMatch = match.match(/var\((--[^,)]+)(?:,\s*([^)]+))?\)/);
    if (innerMatch) {
      const varName = innerMatch[1];
      const fallback = innerMatch[2] || '';
      
      let value = computedStyle.getPropertyValue(varName).trim();
      
      if (!value && el) {
        value = getComputedStyle(el).getPropertyValue(varName).trim();
      }
      
      if (value) {
        resolvedText = resolvedText.replace(match, value);
      } else if (fallback) {
        resolvedText = resolvedText.replace(match, fallback.trim());
      }
    }
  });
  
  if (resolvedText.match(varRegex)) {
    return resolveCSSVariables(resolvedText);
  }
  
  return resolvedText;
}

function getComputedCSSForElement(element) {
  const computed = getComputedStyle(element);
  const importantProps = [
    'display', 'position', 'width', 'height', 'margin', 'padding',
    'color', 'background-color', 'font-size', 'font-weight',
    'border', 'flex', 'grid', 'opacity', 'z-index', 'overflow',
    'transform', 'transition', 'animation'
  ];
  
  let result = [];
  importantProps.forEach(prop => {
    const value = computed.getPropertyValue(prop);
    if (value && value !== 'none' && value !== 'auto' && value !== '0px') {
      result.push(`  ${prop}: ${value};`);
    }
  });
  
  return result;
}

let fullHtml = [];
let currentElement = el;
let levels = 0;
let allElements = [];

while (currentElement && currentElement.tagName && levels < 10) {
  allElements.unshift(currentElement);
  
  let tag = currentElement.tagName.toLowerCase();
  let id = currentElement.id ? ` id="${currentElement.id}"` : '';
  let classes = currentElement.className ? ` class="${currentElement.className}"` : '';
  
  let otherAttributes = '';
  Array.from(currentElement.attributes).forEach(attr => {
    if (attr.name !== 'id' && attr.name !== 'class') {
      otherAttributes += ` ${attr.name}="${attr.value}"`;
    }
  });
  
  let opening = `<${tag}${id}${classes}${otherAttributes}>`;
  let closing = `</${tag}>`;
  
  fullHtml.unshift({
    level: levels,
    opening: opening,
    closing: closing,
    element: currentElement
  });
  
  currentElement = currentElement.parentElement;
  levels++;
}

let relatedStyles = new Set();
let computedStyles = new Map();
let cssVariables = new Map();
let selectorsToSearch = [];

allElements.forEach(elem => {
  if (elem.id) selectorsToSearch.push(`#${elem.id}`);
  if (elem.className) {
    elem.className.split(' ').forEach(c => {
      if (c.trim()) selectorsToSearch.push(`.${c}`);
    });
  }
  selectorsToSearch.push(elem.tagName.toLowerCase());
});

selectorsToSearch = [...new Set(selectorsToSearch)];

try {
  for (let sheet of document.styleSheets) {
    try {
      for (let rule of sheet.cssRules || []) {
        if (rule.selectorText === ':root' || rule.selectorText === 'html') {
          for (let prop of rule.style) {
            if (prop.startsWith('--')) {
              cssVariables.set(prop, rule.style.getPropertyValue(prop).trim());
            }
          }
        }
      }
    } catch (e) {}
  }
} catch (e) {}

try {
  for (let sheet of document.styleSheets) {
    try {
      for (let rule of sheet.cssRules || []) {
        selectorsToSearch.forEach(sel => {
          if (rule.selectorText?.includes(sel)) {
            let originalCSS = rule.cssText;
            let resolvedCSS = resolveCSSVariables(rule.cssText);
            
            if (originalCSS !== resolvedCSS) {
              relatedStyles.add(`📝 Original: ${originalCSS}`);
              relatedStyles.add(`✅ Resolvido: ${resolvedCSS}`);
              relatedStyles.add('---');
            } else {
              relatedStyles.add(originalCSS);
            }
          }
        });
      }
    } catch (e) {}
  }
} catch (e) {}

let computedForElement = getComputedCSSForElement(el);

let variablesList = [];
cssVariables.forEach((value, name) => {
  let isUsed = false;
  try {
    const computed = getComputedStyle(el);
    const usedValue = computed.getPropertyValue(name).trim();
    if (usedValue) {
      isUsed = true;
      variablesList.push(`  ${name}: ${value} (usado como: ${usedValue})`);
    } else {
      variablesList.push(`  ${name}: ${value}`);
    }
  } catch (e) {
    variablesList.push(`  ${name}: ${value}`);
  }
});

if (el.className) {
  el.className.split(' ').forEach(c => {
    for (let sheet of document.styleSheets) {
      try {
        for (let rule of sheet.cssRules || []) {
          if (rule.selectorText?.includes(c)) {
            let resolved = resolveCSSVariables(rule.cssText);
            if (resolved !== rule.cssText) {
              output.push(`📝 Original: ${rule.cssText}`);
              output.push(`✅ Resolvido: ${resolved}`);
            } else {
              output.push(rule.cssText);
            }
          }
        }
      } catch (e) {}
    }
  });
}

let namesToSearch = new Set();
if (el.id) namesToSearch.add(el.id);
if (el.className) {
  el.className.split(' ').filter(c => c.trim()).forEach(c => namesToSearch.add(c));
}
Array.from(el.attributes).forEach(attr => {
  if (attr.value && (attr.value.includes('-') || /[a-z]/i.test(attr.value))) {
    namesToSearch.add(attr.value);
  }
});
namesToSearch.add(el.tagName.toLowerCase());

let scripts = Array.from(document.querySelectorAll('script'))
  .map(s => s.textContent)
  .filter(t => t && t.length > 0);

let seen = new Set();
let allNames = new Set(namesToSearch);

let manipulationMethods = [
  'setAttribute', 'removeAttribute', 'appendChild', 'removeChild',
  'insertAdjacentHTML', 'innerHTML', 'outerHTML', 'insertAdjacentText',
  'classList.add', 'classList.remove', 'classList.toggle', 'classList.replace',
  'addEventListener', 'removeEventListener', 'style', 'css', 'attr',
  'addClass', 'removeClass', 'toggleClass', 'hasClass', 'prop', 'val',
  'after', 'before', 'append', 'prepend', 'remove', 'empty', 'html', 'text',
  'replaceChild', 'insertBefore', 'cloneNode', 'replaceWith', 'insertAdjacentElement',
  'scrollIntoView', 'focus', 'blur', 'click', 'submit', 'reset'
];

function findElementsInCode(line) {
  let elements = [];
  let matches = line.match(/querySelector\(['"]([^'"]+)['"]\)/g) || [];
  matches.forEach(m => {
    let selector = m.replace(/querySelector\(['"]/, '').replace(/['"]\)/, '');
    elements.push(selector);
  });
  
  matches = line.match(/getElementById\(['"]([^'"]+)['"]\)/g) || [];
  matches.forEach(m => {
    let id = m.replace(/getElementById\(['"]/, '').replace(/['"]\)/, '');
    elements.push('#' + id);
  });
  
  return elements;
}

function extractNamesFromCode(code) {
  let names = new Set();
  let matches = code.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
  matches.forEach(name => {
    if (name.length > 1 && 
        !['var','let','const','function','return','if','else','for','while',
          'this','true','false','null','undefined','new','typeof','instanceof',
          'document','window','console','alert','setTimeout','setInterval',
          'Array','Object','String','Number','Boolean','Promise','async',
          'await','try','catch','finally','throw','class','extends',
          'import','export','default','from','as','break','continue',
          'switch','case','default','do','in','of','typeof','void',
          'delete','instanceof','new','super','yield'].includes(name)) {
      names.add(name);
    }
  });
  return names;
}

function trace(name, level) {
  if (level > 1000) return;
  let key = name + ':' + level;
  if (seen.has(key)) return;
  seen.add(key);

  scripts.forEach((script, idx) => {
    let lines = script.split('\n');
    lines.forEach((line, i) => {
      if (!line.includes(name)) return;

      let spaces = '  '.repeat(Math.min(level, 20));
      let cleanLine = line.trim();

      let hasMethod = manipulationMethods.some(method => line.includes(method));
      
      let isDefinition = 
        line.includes('var ' + name) ||
        line.includes('let ' + name) ||
        line.includes('const ' + name) ||
        line.includes('function ' + name) ||
        line.match(new RegExp(name + '\\s*=\\s*function')) ||
        line.match(new RegExp(name + '\\s*[:=]\\s*\\([^)]*\\)\\s*=>'));

      if (hasMethod || isDefinition) {
        let marker = hasMethod ? '⚡' : '📌';
        let formattedLine = spaces + `${marker} [${level}] Script ${idx}:${i+1} | ${cleanLine}`;
        output.push(formattedLine);
        
        uniqueLines.add(cleanLine);

        let elementsInLine = findElementsInCode(line);
        if (elementsInLine.length > 0) {
          elementsInLine.forEach(sel => {
            relatedElements.add(sel);
            relationships.push({
              from: name,
              to: sel,
              action: cleanLine,
              script: idx,
              line: i+1
            });
          });
        }

        let newNames = extractNamesFromCode(line);
        newNames.forEach(newName => {
          if (newName !== name && !allNames.has(newName)) {
            allNames.add(newName);
            trace(newName, level + 1);
          }
        });
      }
    });
  });
}

namesToSearch.forEach(name => trace(name, 0));

const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);

console.log('%c🔷 COMPLETE ELEMENT ANALYSIS (WITH CSS VARIABLES RESOLVED) 🔷', 'font-size:16px; font-weight:bold; color:#4A90E2;');
console.log('%c⏱️  Analysis completed in ' + totalTime + ' seconds', 'font-size:12px; color:#666;');
console.log('='.repeat(80));

console.log('%c📄 HTML STRUCTURE:', 'font-size:14px; font-weight:bold; color:#27AE60;');
console.log('-'.repeat(50));

let htmlFinal = [];
fullHtml.forEach((item, index) => {
  let indent = '  '.repeat(index);
  htmlFinal.push(indent + item.opening);
});

let indentEl = '  '.repeat(fullHtml.length - 1);
htmlFinal[indentEl.length/2] = htmlFinal[indentEl.length/2] + ' ← [SELECTED]';

for (let i = fullHtml.length - 1; i >= 0; i--) {
  let indent = '  '.repeat(i);
  htmlFinal.push(indent + fullHtml[i].closing);
}

console.log(htmlFinal.join('\n'));

console.log('\n%c🎨 CSS VARIABLES DEFINED:', 'font-size:14px; font-weight:bold; color:#F39C12;');
console.log('-'.repeat(50));
if (variablesList.length > 0) {
  variablesList.forEach(v => console.log(v));
} else {
  console.log('No CSS variables defined');
}

console.log('\n%c🎨 RELATED CSS (with variables resolved):', 'font-size:14px; font-weight:bold; color:#E67E22;');
console.log('-'.repeat(50));
if (relatedStyles.size > 0) {
  relatedStyles.forEach(css => console.log(css));
} else {
  console.log('No specific CSS found');
}

console.log('\n%c📊 COMPUTED STYLES (actual values applied):', 'font-size:14px; font-weight:bold; color:#3498DB;');
console.log('-'.repeat(50));
if (computedForElement.length > 0) {
  console.log('element {');
  computedForElement.forEach(line => console.log(line));
  console.log('}');
}

console.log('\n%c🔗 RELATED ELEMENTS (manipulated along with selected one):', 'font-size:14px; font-weight:bold; color:#9B59B6;');
console.log('-'.repeat(50));
if (relationships.length > 0) {
  relationships.forEach(r => {
    console.log(`📌 ${r.from} → ${r.to}`);
    console.log(`   Action: ${r.action}`);
    console.log(`   Location: Script ${r.script}, line ${r.line}`);
    console.log('');
  });
  
  console.log('🎯 Elements found:');
  relatedElements.forEach(sel => console.log(`   - ${sel}`));
} else {
  console.log('No related elements found');
}

console.log('\n%c⚡ JAVASCRIPT:', 'font-size:14px; font-weight:bold; color:#E74C3C;');
console.log('-'.repeat(50));
if (uniqueLines.size > 0) {
  console.log(Array.from(uniqueLines).join('\n'));
} else {
  console.log('No JavaScript found');
}

console.log('\n' + '='.repeat(80));
console.log('📊 SUMMARY:');
console.log(`📄 HTML: ${fullHtml.length} levels`);
console.log(`🎨 CSS Variables: ${variablesList.length} defined`);
console.log(`🎨 CSS Rules: ${relatedStyles.size} rules`);
console.log(`📊 Computed properties: ${computedForElement.length}`);
console.log(`🔗 Related elements: ${relatedElements.size}`);
console.log(`⚡ JavaScript: ${uniqueLines.size} lines`);
console.log(`⏱️  Total time: ${totalTime}s`);

console.log( {
    html: htmlFinal.join('\n'),
    cssVariables: Array.from(cssVariables.entries()),
    css: Array.from(relatedStyles),
    computed: computedForElement,
    js: Array.from(uniqueLines),
    related: Array.from(relatedElements),
    relationships: relationships,
    performance: totalTime + 's'
});

}
