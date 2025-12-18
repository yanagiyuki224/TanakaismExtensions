const vscode = require('vscode');

// --- KEYWORDS_START ---
const K = {
    "VAR": "変数宣言",
    "PRINT": "表示",
    "COMMENT": "コメント",
    "IF": "もし",
    "ELIF": "違ったら",
    "ELSE": "それ以外",
    "END": "終了"
};
// --- KEYWORDS_END ---

// 正規表現用にエスケープする関数
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let memory = {};
let outputChannel;

// 条件式の評価
function evaluateCondition(condition, mem) {
    let evalStr = condition;
    for (let varName in mem) {
        const regex = new RegExp(`\\b${varName}\\b`, 'g');
        evalStr = evalStr.replace(regex, JSON.stringify(mem[varName]));
    }
    try { return !!(eval(evalStr)); } catch (e) { return false; }
}

// ジャンプ先探し（日本語対応：\\bの代わりにスペースまたは行末を判定）
function findJumpTarget(lines, currentPc) {
    let depth = 0;
    const ifPattern = new RegExp(`^${escapeRegex(K.IF)}(\\s+|$)`);
    const elifPattern = new RegExp(`^${escapeRegex(K.ELIF)}(\\s+|$)`);
    
    for (let i = currentPc + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.match(ifPattern)) { depth++; continue; }
        if (line === K.END) {
            if (depth === 0) return i;
            depth--;
            continue;
        }
        if (depth === 0 && (line.match(elifPattern) || line === K.ELSE)) {
            return i;
        }
    }
    return lines.length;
}

function findEndTag(lines, currentPc) {
    let depth = 0;
    const ifPattern = new RegExp(`^${escapeRegex(K.IF)}(\\s+|$)`);
    
    for (let i = currentPc + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.match(ifPattern)) depth++;
        if (line === K.END) {
            if (depth === 0) return i;
            depth--;
        }
    }
    return lines.length;
}

// VSCode用実行エンジン
function executeCore(lines, channel) {
    memory = {};
    let pc = 0;
    const totalLines = lines.length;
    channel.appendLine(`--- Tanakaism 実行開始 ---`);

    while (pc < totalLines) {
        const line = lines[pc].trim();
        if (!line || line.startsWith(K.COMMENT)) { pc++; continue; }

        try {
            // IF
            const ifMatch = line.match(new RegExp(`^${escapeRegex(K.IF)}\\s+(.*)`));
            if (ifMatch) {
                if (evaluateCondition(ifMatch[1], memory)) { pc++; } 
                else { pc = findJumpTarget(lines, pc); }
                continue;
            }
            
            // ELIF
            const elifMatch = line.match(new RegExp(`^${escapeRegex(K.ELIF)}\\s+(.*)`));
            if (elifMatch) {
                pc = findEndTag(lines, pc);
                continue;
            }
            
            // ELSE
            if (line === K.ELSE) {
                pc = findEndTag(lines, pc);
                continue;
            }
            
            if (line === K.END) { pc++; continue; }

            // 変数代入 (VAR)
            const varMatch = line.match(new RegExp(`^${escapeRegex(K.VAR)}\\s+(\\w+)\\s*=\\s*(.*)`));
            if (varMatch) {
                const var_name = varMatch[1];
                let val = varMatch[2].trim();
                if (val.startsWith('"') && val.endsWith('"')) {
                    memory[var_name] = val.slice(1, -1);
                } else {
                    let evalStr = val;
                    for (let v in memory) {
                        evalStr = evalStr.replace(new RegExp(`\\b${v}\\b`, 'g'), memory[v]);
                    }
                    memory[var_name] = isNaN(evalStr) ? evalStr : eval(evalStr);
                }
                pc++; continue;
            } 
            // 出力 (PRINT)
            const printMatch = line.match(new RegExp(`^${escapeRegex(K.PRINT)}\\s+(.*)`));
            if (printMatch) {
                let expr = printMatch[1].trim();
                let out = (expr.startsWith('"') && expr.endsWith('"')) ? expr.slice(1, -1) : (memory.hasOwnProperty(expr) ? memory[expr] : expr);
                channel.appendLine(String(out));
                pc++; continue;
            }

            channel.appendLine(`[Line ${pc+1}] 未知のコマンド: ${line}`);
        } catch (e) {
            channel.appendLine(`[Line ${pc+1}] エラー: ${e.message}`);
        }
        pc++;
    }
    channel.appendLine("--- 実行終了 ---");
}

function activate(context) {
    outputChannel = vscode.window.createOutputChannel("Tanakaism Output");

    let runCommand = vscode.commands.registerTextEditorCommand('oreore.runTanakaism', (textEditor) => {
        if (textEditor.document.languageId !== 'tanakaism') return;
        outputChannel.show(true);
        outputChannel.clear();
        executeCore(textEditor.document.getText().split(/\r?\n/), outputChannel);
    });

    const provider = vscode.languages.registerCompletionItemProvider('tanakaism', {
        provideCompletionItems() {
            return Object.values(K).map(k => new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword));
        }
    });

    context.subscriptions.push(runCommand, provider);
}

function deactivate() {
    if (outputChannel) outputChannel.dispose();
}

module.exports = { activate, deactivate };