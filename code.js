
// Usage: paste in browser console

let el = $0;
if (!el) {
    console.error('❌ Select an element first!');
} else {
    const startTime = performance.now();
    
    // Load AST parser (acorn) dynamically
    async function loadParser() {
        if (window.acorn) return window.acorn;
        
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/acorn@8.8.2/dist/acorn.js';
            script.onload = () => {
                const walkScript = document.createElement('script');
                walkScript.src = 'https://unpkg.com/acorn-walk@8.2.0/dist/walk.js';
                walkScript.onload = () => resolve(window.acorn);
                document.head.appendChild(walkScript);
            };
            document.head.appendChild(script);
        });
    }
    
    loadParser().then(acorn => {
        const walk = window.acorn.walk;
        
        // ========== VARIABLE AND TYPE ANALYSIS ==========
        class VariableAnalyzer {
            constructor() {
                this.variables = new Map();
                this.methodCalls = [];
                this.functions = new Map();
                this.arrays = new Map();
                this.objects = new Map();
            }
            
            analyzeScripts() {
                const scripts = Array.from(document.querySelectorAll('script'))
                    .map(s => s.textContent)
                    .filter(t => t && t.length > 0);
                
                scripts.forEach((code, scriptIndex) => {
                    try {
                        const ast = acorn.parse(code, {
                            ecmaVersion: 2020,
                            locations: true
                        });
                        
                        this.collectDeclarations(ast, scriptIndex);
                        this.detectMethodCalls(ast, scriptIndex);
                        
                    } catch (e) {
                        // Silent fail - no fallback to avoid false positives
                    }
                });
            }
            
            collectDeclarations(ast, scriptIndex) {
                walk.simple(ast, {
                    VariableDeclarator: (node) => {
                        const name = node.id.name;
                        const init = node.init;
                        
                        if (!init) {
                            this.variables.set(name, {
                                name, type: 'undefined', script: scriptIndex
                            });
                            return;
                        }
                        
                        switch(init.type) {
                            case 'ArrayExpression':
                                const elements = init.elements.map(e => {
                                    if (e.type === 'Literal') return e.value;
                                    if (e.type === 'Identifier') return `ref:${e.name}`;
                                    return 'unknown';
                                });
                                
                                this.arrays.set(name, {
                                    type: 'array',
                                    elements,
                                    length: init.elements.length,
                                    line: init.loc?.start.line,
                                    script: scriptIndex
                                });
                                
                                this.variables.set(name, {
                                    name, type: 'array', script: scriptIndex
                                });
                                break;
                                
                            case 'ObjectExpression':
                                const props = {};
                                init.properties.forEach(prop => {
                                    const key = prop.key.name || prop.key.value;
                                    props[key] = prop.value.type;
                                });
                                
                                this.objects.set(name, {
                                    type: 'object',
                                    properties: props,
                                    line: init.loc?.start.line,
                                    script: scriptIndex
                                });
                                
                                this.variables.set(name, {
                                    name, type: 'object', script: scriptIndex
                                });
                                break;
                                
                            case 'FunctionExpression':
                            case 'ArrowFunctionExpression':
                                this.functions.set(name, {
                                    type: 'function',
                                    params: init.params.map(p => p.name),
                                    line: init.loc?.start.line,
                                    script: scriptIndex
                                });
                                
                                this.variables.set(name, {
                                    name, type: 'function', script: scriptIndex
                                });
                                break;
                                
                            case 'Literal':
                                this.variables.set(name, {
                                    name, 
                                    type: typeof init.value,
                                    value: init.value,
                                    script: scriptIndex
                                });
                                break;
                                
                            case 'Identifier':
                                this.variables.set(name, {
                                    name,
                                    type: 'reference',
                                    refersTo: init.name,
                                    script: scriptIndex
                                });
                                break;
                                
                            case 'CallExpression':
                                const methodName = init.callee.type === 'MemberExpression' 
                                    ? init.callee.property.name 
                                    : init.callee.name;
                                    
                                this.variables.set(name, {
                                    name,
                                    type: 'call_result',
                                    called: methodName,
                                    executes: true,
                                    line: init.loc?.start.line,
                                    script: scriptIndex
                                });
                                break;
                        }
                    },
                    
                    FunctionDeclaration: (node) => {
                        this.functions.set(node.id.name, {
                            type: 'function',
                            params: node.params.map(p => p.name),
                            line: node.loc?.start.line,
                            script: scriptIndex
                        });
                        
                        this.variables.set(node.id.name, {
                            name: node.id.name, type: 'function', script: scriptIndex
                        });
                    }
                });
            }
            
            detectMethodCalls(ast, scriptIndex) {
                walk.simple(ast, {
                    CallExpression: (node) => {
                        if (node.callee.type === 'MemberExpression') {
                            const object = node.callee.object.name;
                            const method = node.callee.property.name;
                            
                            this.methodCalls.push({
                                type: 'method_call',
                                object,
                                method,
                                line: node.loc?.start.line,
                                script: scriptIndex,
                                arguments: node.arguments.map(a => a.type),
                                objectExists: this.variables.has(object),
                                objectType: this.variables.get(object)?.type
                            });
                            
                            return;
                        }
                        
                        if (node.callee.type === 'Identifier') {
                            const funcName = node.callee.name;
                            
                            this.methodCalls.push({
                                type: 'function_call',
                                function: funcName,
                                line: node.loc?.start.line,
                                script: scriptIndex,
                                isFunction: this.functions.has(funcName) || 
                                           this.variables.get(funcName)?.type === 'function'
                            });
                        }
                    },
                    
                    NewExpression: (node) => {
                        this.methodCalls.push({
                            type: 'constructor_call',
                            constructor: node.callee.name,
                            line: node.loc?.start.line,
                            script: scriptIndex
                        });
                    },
                    
                    AssignmentExpression: (node) => {
                        if (node.left.type === 'MemberExpression' &&
                            (node.left.property.name === 'onclick' ||
                             node.left.property.name === 'onload' ||
                             node.left.property.name === 'onchange')) {
                            
                            this.methodCalls.push({
                                type: 'event_handler',
                                object: node.left.object.name,
                                event: node.left.property.name,
                                line: node.loc?.start.line,
                                script: scriptIndex,
                                handler: node.right.type
                            });
                        }
                    }
                });
            }
            
            getMethodsRelatedTo(element) {
                const elementClasses = Array.from(element.classList);
                const elementId = element.id;
                const elementTag = element.tagName.toLowerCase();
                
                const relevant = this.methodCalls.filter(call => {
                    const callStr = JSON.stringify(call).toLowerCase();
                    
                    const hasClassRef = elementClasses.some(c => 
                        callStr.includes(c.toLowerCase()));
                    const hasIdRef = elementId && callStr.includes(elementId.toLowerCase());
                    const hasTagRef = callStr.includes(elementTag);
                    
                    return hasClassRef || hasIdRef || hasTagRef;
                });
                
                return {
                    calls: relevant,
                    variables: Array.from(this.variables.entries()),
                    arrays: Array.from(this.arrays.entries()),
                    objects: Array.from(this.objects.entries()),
                    functions: Array.from(this.functions.entries())
                };
            }
        }
        
        // ========== RUN ANALYSIS ==========
        const analyzer = new VariableAnalyzer();
        analyzer.analyzeScripts();
        
        const result = analyzer.getMethodsRelatedTo(el);
        
        const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
        
        console.log('%c🔷 DEEP-ANALYZE WITH AST 🔷', 'font-size:16px; font-weight:bold; color:#4A90E2;');
        console.log(`⏱️  Analysis in ${totalTime}s`);
        console.log('='.repeat(80));
        
        console.log('%c📞 REAL METHOD CALLS:', 'font-size:14px; font-weight:bold; color:#27AE60;');
        console.log('-'.repeat(50));
        
        if (result.calls.length > 0) {
            result.calls.forEach(call => {
                if (call.type === 'method_call') {
                    console.log(`✅ ${call.object}.${call.method}()`);
                } else if (call.type === 'function_call') {
                    console.log(`✅ ${call.function}()`);
                } else {
                    console.log(`✅ ${call.type}:`, call);
                }
                console.log(`   📍 Script ${call.script}, line ${call.line}`);
                console.log('');
            });
        } else {
            console.log('ℹ️ No method calls found');
        }
        
        console.log('%c📦 VARIABLES:', 'font-size:14px; font-weight:bold; color:#F39C12;');
        console.log('-'.repeat(50));
        
        result.variables.forEach(([name, info]) => {
            console.log(`📌 ${name}: ${info.type}`);
        });
        
        if (result.arrays.length > 0) {
            console.log('\n%c📋 ARRAYS:', 'font-size:14px; font-weight:bold; color:#3498DB;');
            result.arrays.forEach(([name, info]) => {
                console.log(`📌 ${name} = [${info.elements.join(', ')}] (${info.length} items)`);
            });
        }
        
        if (result.objects.length > 0) {
            console.log('\n%c🔧 OBJECTS:', 'font-size:14px; font-weight:bold; color:#9B59B6;');
            result.objects.forEach(([name, info]) => {
                const props = Object.keys(info.properties).join(', ');
                console.log(`📌 ${name} = { ${props} }`);
            });
        }
        
        if (result.functions.length > 0) {
            console.log('\n%c⚡ FUNCTIONS:', 'font-size:14px; font-weight:bold; color:#E74C3C;');
            result.functions.forEach(([name, info]) => {
                console.log(`📌 ${name}(${info.params.join(', ')})`);
            });
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 SUMMARY:');
        console.log(`📞 Method calls: ${result.calls.length}`);
        console.log(`📦 Variables: ${result.variables.length}`);
        console.log(`📋 Arrays: ${result.arrays.length}`);
        console.log(`🔧 Objects: ${result.objects.length}`);
        console.log(`⚡ Functions: ${result.functions.length}`);
        console.log(`⏱️  Time: ${totalTime}s`);
    }).catch(() => {
        console.error('❌ Failed to load parser');
    });
}
