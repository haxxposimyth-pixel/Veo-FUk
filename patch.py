import re

with open('backend/src/agents/veo-agent.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove baseClipCount logic (Chunk 1)
content = re.sub(
    r'const baseWordCount = getWordCount[^;]+;\n\s*const baseClipCount = getRequiredClipCount[^;]+;\n\n\s*// Loop 2: Completeness Gate & Single Retry\n\s*let validationResult = baseClipCount > 1\n\s*\? \{ success: true \}\n\s*: safeParseVeoPrompt\(data, resolvedScene\);',
    r'// Loop 2: Completeness Gate & Single Retry\n      let validationResult = safeParseVeoPrompt(data, resolvedScene);',
    content
)

# 2. Remove baseClipCount > 1 block (Chunk 2)
match = re.search(r'(?s)(\s*if \(baseClipCount > 1\) \{.*?\} else \{\s*data\.prompt_number = 1 as any;\s*data\.veo_full_prompt = assembleVeoFullPrompt\(data, 1, resolvedScene\.title \|\| \'Untitled Scene\'\);\s*\})', content)
if match:
    replacement = r'''
      data.prompt_number = 1 as any;
      data.veo_full_prompt = assembleVeoFullPrompt(data, 1, resolvedScene.title || 'Untitled Scene');'''
    content = content[:match.start(1)] + replacement + content[match.end(1):]
else:
    print('COULD NOT FIND baseClipCount > 1 block!')

# 3. Remove monkeypatch for _recalculatePromptNumbers
match2 = re.search(r'(?s)(// Monkeypatch VeoPromptRepository\._recalculatePromptNumbers.*?};\n)', content)
if match2:
    content = content[:match2.start(1)] + content[match2.end(1):]
else:
    print('COULD NOT FIND monkeypatch!')

# 4. Remove validator leakage in postProcess
content = content.replace('data[v.field] = v.suggestion;', '// data[v.field] = v.suggestion; // LEAKAGE FIXED')

with open('backend/src/agents/veo-agent.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Patched veo-agent.ts successfully!')
