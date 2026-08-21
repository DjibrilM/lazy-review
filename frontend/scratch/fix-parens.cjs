const fs = require('fs');
const path = require('path');

function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFiles(filePath, files);
    } else if (filePath.endsWith('.tsx')) {
      files.push(filePath);
    }
  }
  return files;
}

const files = getFiles('src');
let modifiedFiles = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  content = content.replace(/(<Visible[^>]*>)\s*\(\s*(<)/g, '$1\n$2');
  content = content.replace(/(>)\s*\)\s*(<\/Visible>)/g, '$1\n$2');
  content = content.replace(/(<Visible[^>]*>)\s*\(\s*\n/g, '$1\n');
  content = content.replace(/\n\s*\)\s*(<\/Visible>)/g, '\n$2');

  // Also let's fix `visible={someObj}` to `visible={!!someObj}` for common cases in RepoSelector if needed.
  // Actually, I will fix RepoSelector specifically for `visible={repo.owner?.avatar_url}` and `visible={repo.private}`

  if (file.endsWith('RepoSelector.tsx')) {
    content = content.replace(/visible=\{repo\.owner\?\.avatar_url\}/g, 'visible={!!repo.owner?.avatar_url}');
    content = content.replace(/visible=\{repo\.private\}/g, 'visible={!!repo.private}');
    content = content.replace(/visible=\{userProfile\.bio\}/g, 'visible={!!userProfile?.bio}');
    content = content.replace(/visible=\{userProfile\.company\}/g, 'visible={!!userProfile?.company}');
    content = content.replace(/visible=\{userProfile\.location\}/g, 'visible={!!userProfile?.location}');
    content = content.replace(/visible=\{userProfile\.blog\}/g, 'visible={!!userProfile?.blog}');
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedFiles++;
  }
}

console.log(`Fixed stray parentheses in ${modifiedFiles} files.`);
