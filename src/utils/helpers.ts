import fs from 'fs';

export function writeToPromptsFile(text: string) {
    fs.appendFileSync('../../prompts.txt', text + "\n");    
}

export function clearPromptsFile() {
    fs.writeFileSync('../../prompts.txt', '');
}
