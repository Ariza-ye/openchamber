const fs = require('fs');
const path = require('path');

const dir = path.resolve('packages/ui/src/components/sections/openchamber');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

let extractedKeys = new Set();

const regexes = [
    // Matches >Text<
    {
        pattern: />([^<>{}\n\t]+)</g,
        replace: (match, text) => {
            const trimmed = text.trim();
            // Accept title case, standard sentences, or specific keywords. Avoid css variables, math.
            if (trimmed && /^[A-Z][a-zA-Z0-9\s.,'()\-:;!?]+$/.test(trimmed) && !trimmed.includes('var(--')) {
                extractedKeys.add(trimmed);
                return match.replace(trimmed, `{t('${trimmed}')}`);
            }
            if (trimmed && /^[a-z]+(\s[a-zA-Z0-9]+)+$/.test(trimmed) && !trimmed.includes('var(--')) {
                extractedKeys.add(trimmed);
                return match.replace(trimmed, `{t('${trimmed}')}`);
            }
            const whitelist = ['Browser', 'Say', 'Auto', 'Reset', 'Cancel', 'Save', 'Overwrite', 'days', 'file', 'skipped', 'Empty', 'Queued', 'Aborted', 'Image', 'User', 'Assistant', 'System'];
            if (whitelist.includes(trimmed)) {
                extractedKeys.add(trimmed);
                return match.replace(trimmed, `{t('${trimmed}')}`);
            }
            return match;
        }
    },
    // Matches placeholder="Text"
    {
        pattern: /(placeholder|aria-label|ariaLabel|title)="([^"]+)"/g,
        replace: (match, attr, text) => {
            if (text && !text.startsWith('e.g.') && !text.startsWith('/') && !text.startsWith('sk-')) {
                extractedKeys.add(text);
                return `${attr}={t('${text}')}`;
            }
            return match;
        }
    },
    // Matches 'Text' in toast.success('Text')
    {
        pattern: /toast\.(success|error|message|info)\('([^']+)'/g,
        replace: (match, method, text) => {
            extractedKeys.add(text);
            return `toast.${method}(t('${text}')`;
        }
    }
];

files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf-8');

    // Add import if not present
    if (!content.includes("useI18n")) {
        // Find last import
        const imports = content.match(/^import .*?;/gm);
        if (imports) {
            const lastImport = imports[imports.length - 1];
            content = content.replace(lastImport, `${lastImport}\nimport { useI18n } from '@/contexts/useI18n';`);
        } else {
            content = `import { useI18n } from '@/contexts/useI18n';\n` + content;
        }
    }

    // Add const { t } = useI18n(); inside functional components
    content = content.replace(/(const [A-Z]\w+:\s*React\.FC(?:<[^>]+>)?\s*=\s*\([^)]*\)\s*=>\s*{)/g, (match) => {
        return `${match}\n  const { t } = useI18n();`;
    });

    // Apply regexes
    regexes.forEach(({pattern, replace}) => {
        content = content.replace(pattern, replace);
    });

    // Specific fixes for TSX syntax where needed
    fs.writeFileSync(filePath, content, 'utf-8');
});

fs.writeFileSync('extracted_keys.json', JSON.stringify(Array.from(extractedKeys).sort(), null, 2));
console.log('Processed', files.length, 'files');
