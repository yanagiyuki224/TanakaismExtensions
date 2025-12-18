const fs = require('fs');

// keywords.json から最新の定義を取得
const K = JSON.parse(fs.readFileSync('./keywords.json', 'utf8'));
// キーワード一覧を作成
const keywordList = Object.values(K).join('|');

function updateJsFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const startTag = '// --- KEYWORDS_START ---';
    const endTag = '// --- KEYWORDS_END ---';
    
    // タグの間を keywords.json の中身で置換
    const newContent = `${startTag}\nconst K = ${JSON.stringify(K, null, 4)};\n${endTag}`;
    const regex = new RegExp(`${startTag}[\\s\\S]*${endTag}`);
    
    if (regex.test(content)) {
        content = content.replace(regex, newContent);
        fs.writeFileSync(filePath, content);
        console.log(`✅ Updated: ${filePath}`);
    } else {
        console.log(`⚠️ Tag not found in: ${filePath}`);
    }
}

function updateConfigs() {
    // 1. 色付け (tmLanguage.json) の更新
    const grammarPath = './syntaxes/tanakaism.tmLanguage.json';
    let grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
    // 日本語対応のため \\b を排除し、(スペースまたは行末) にマッチさせる
    grammar.repository.keywords.patterns[0].match = `(${keywordList})(?=\\s|$)`;
    
    // ★ コメントパターンも更新
    grammar.repository.comments.patterns[0].match = `^\\s*${K.COMMENT}\\b.*$`;
    
    fs.writeFileSync(grammarPath, JSON.stringify(grammar, null, 2));

    // 2. Language Config の更新
    const configPath = './language-configuration.json';
    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.comments.lineComment = K.COMMENT;
    // インデントルールも \\b を消して (\\s+|$) に変更
    config.indentationRules.increaseIndentPattern = `^\\s*(${K.IF}|${K.ELIF}|${K.ELSE})(\\s+|$)`;
    config.indentationRules.decreaseIndentPattern = `^\\s*(${K.ELIF}|${K.ELSE}|${K.END})(\\s+|$)`;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    
    console.log(`✅ Updated: Config files`);
}

updateJsFile('./extension.js');
updateJsFile('./tanakaism');
updateConfigs();