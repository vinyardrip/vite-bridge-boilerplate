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
    // 1. Находим все HTML-файлы в папке сборки (dist).
    // stats.html — отчет rollup-plugin-visualizer (pnpm build:stats), это
    // не страница сайта: критикал для него не считается.
    const htmlFiles = (await glob("**/*.html", { cwd: distPath })).filter(
      (file) => path.basename(file) !== "stats.html",
    );

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
        // Встраиваем CSS прямо в HTML. ЯВНАЯ точка вставки <style>
        // (selector) — ОБЯЗАТЕЛЬНО: без нее в inline-critical@12.1.0 падает
        // с «HierarchyRequestError: Invalid insertion of STYLE node in
        // #document node» — его flatten() не разворачивает вложенные списки
        // селекторов, и undefined-элемент (o.selector) превращается в ПУСТОЙ
        // селектор в начале списка (",…"), который nwsapi (движок селекторов
        // jsdom) парсит криво и возвращает корневой <html>; critical пытается
        // вставить <style> перед <html>. Явный селектор ссылки стилей убирает
        // пустой элемент списка — <style> встает прямо перед ней (классическое
        // место критического CSS). Ссылка есть на всех страницах dist.
        // ВАЖНО: selector передается в подобъекте inline (на верхнем уровне
        // generate() конфиг валидируется и "selector is not allowed").
        // inline-объект (в отличие от inline: true) НЕ включает стратегию
        // media — остаемся на дефолте: линк становится rel="preload", а
        // рабочий <link rel="stylesheet"> добавляется в <body> — CSS грузится
        // даже с отключенным JavaScript.
        inline: { selector: 'link[rel="stylesheet"]' },
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
