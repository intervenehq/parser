import fs from 'fs';

export function writeToPromptsFile(text: string) {
    fs.writeFileSync('../../prompts.txt', text + "\n");    
}