const fs = require('node:fs');
const path = require('node:path');

const buildFile = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native',
  'gradle-plugin',
  'build.gradle.kts',
);

if (!fs.existsSync(buildFile)) process.exit(0);

const fragileLine =
  'allprojects { tasks.withType<com.ncorti.ktfmt.gradle.tasks.KtfmtCheckTask>() { enabled = false } }';
const compatibleLine =
  'allprojects { tasks.matching { it.name == "ktfmtCheck" }.configureEach { enabled = false } }';
const source = fs.readFileSync(buildFile, 'utf8');

if (source.includes(fragileLine)) {
  fs.writeFileSync(buildFile, source.replace(fragileLine, compatibleLine));
}
