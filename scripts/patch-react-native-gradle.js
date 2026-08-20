const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const buildFile = path.join(root, 'node_modules', '@react-native', 'gradle-plugin', 'build.gradle.kts');

function replaceInFile(file, from, to) {
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, 'utf8');
  const next = source.replaceAll(from, to);
  if (next !== source) fs.writeFileSync(file, next);
}

function appendLineIfMissing(file, line) {
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, 'utf8');
  if (!source.split(/\r?\n/).includes(line)) {
    fs.writeFileSync(file, `${source.trimEnd()}\n\n${line}\n`);
  }
}

const fragileLine =
  'allprojects { tasks.withType<com.ncorti.ktfmt.gradle.tasks.KtfmtCheckTask>() { enabled = false } }';
const compatibleLine =
  'allprojects { tasks.matching { it.name == "ktfmtCheck" }.configureEach { enabled = false } }';
replaceInFile(buildFile, fragileLine, compatibleLine);

// Gradle 9.3 has a confirmed Kotlin DSL failure on some Windows systems.
// Gradle 9.4 fixes that path but embeds Kotlin 2.3, so align only the included
// Gradle build plugins with 2.3. The application compiler remains Expo's 2.1.
replaceInFile(
  path.join(root, 'node_modules', '@react-native', 'gradle-plugin', 'gradle', 'libs.versions.toml'),
  'kotlin = "2.1.20"',
  'kotlin = "2.3.0"',
);
for (const relative of [
  ['@react-native', 'gradle-plugin', 'shared', 'build.gradle.kts'],
  ['@react-native', 'gradle-plugin', 'shared-testutil', 'build.gradle.kts'],
  ['@react-native', 'gradle-plugin', 'settings-plugin', 'build.gradle.kts'],
  ['@react-native', 'gradle-plugin', 'react-native-gradle-plugin', 'build.gradle.kts'],
]) {
  replaceInFile(
    path.join(root, 'node_modules', ...relative),
    'apiVersion.set(KotlinVersion.KOTLIN_1_8)',
    'apiVersion.set(KotlinVersion.KOTLIN_1_9)',
  );
}
replaceInFile(
  path.join(root, 'node_modules', 'expo-modules-autolinking', 'android', 'expo-gradle-plugin', 'build.gradle.kts'),
  'kotlin("jvm") version "2.1.20" apply false',
  'kotlin("jvm") version "2.3.0" apply false',
);
replaceInFile(
  path.join(root, 'node_modules', 'expo-modules-core', 'expo-module-gradle-plugin', 'build.gradle.kts'),
  'kotlin("jvm") version "2.1.20"',
  'kotlin("jvm") version "2.3.0"',
);

replaceInFile(
  path.join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'),
  'gradle-9.3.1-bin.zip',
  'gradle-9.4.0-bin.zip',
);
replaceInFile(
  path.join(root, 'android', 'gradle.properties'),
  'org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m',
  'org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8',
);
// A disconnected or unhealthy removable drive can otherwise block Gradle
// while it enumerates every Windows filesystem before the first task starts.
appendLineIfMissing(
  path.join(root, 'android', 'gradle.properties'),
  'org.gradle.vfs.watch=false',
);
