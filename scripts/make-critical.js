import { generate } from "critical";
import { glob } from "glob";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Определяем пути, отталкиваясь от расположения текущего файла
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.resolve(__dirname, "..");
const distPath = path.resolve(rootPath, "dist");

async function run() {
  console.log("🚀 Starting Critical CSS generation...");

  try {
    // 1. Находим все HTML-файлы в папке сборки (dist)
    const htmlFiles = await glob("**/*.html", { cwd: distPath });

    if (htmlFiles.length === 0) {
      console.warn(
        '🟡 No HTML files found in "dist" folder. Skipping Critical CSS.',
      );
      return;
    }

    // 2. Проходимся по каждому файлу и генерируем для него Critical CSS
    for (const file of htmlFiles) {
      const filePath = path.join(distPath, file);
      console.log(`Processing: ${file}`);

      const { html } = await generate({
        // Встраиваем CSS прямо в HTML
        inline: true,
        // Базовый путь - наша папка со сборкой
        base: distPath,
        // Исходный HTML-файл
        src: file,
        // Размеры вьюпорта для определения "видимой части"
        dimensions: [
          {
            height: 900,
            width: 1300,
          },
          {
            height: 896,
            width: 414,
          },
        ],
        // Игнорируем правила @font-face, так как шрифты грузятся асинхронно
        ignore: {
          atrule: ["@font-face"],
        },
      });

      // 3. Перезаписываем HTML-файл уже с инлайновым CSS
      await writeFile(filePath, html);
    }

    console.log("✅ Critical CSS inlined successfully for all HTML files!");
  } catch (error) {
    console.error("❌ Error during Critical CSS generation:");
    console.error(error);
    process.exit(1); // Выходим с ошибкой, чтобы прервать сборку
  }
}

run();
