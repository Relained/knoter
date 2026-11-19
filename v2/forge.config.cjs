const { join } = require('node:path');
const { mkdir, cp } = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
// The bundle ID, the LaunchAgent label, and the data folders keep the app's first name,
// "Knoter Wiki Demo": changing them would strand an installed workspace and registration.
const APP = 'knoter';
module.exports = {
  packagerConfig: {
    name: APP,
    executableName: APP,
    appBundleId: 'com.knoter.wiki-demo',
    appCategoryType: 'public.app-category.productivity',
    // AppIcon.icon carries the light and dark icons and is compiled by actool; AppIcon.icns
    // is the light one alone, for systems before macOS 26. The packager adds each extension.
    icon: 'platform/macos/AppIcon',
    asar: true,
    ignore: (path) =>
      path !== '' && path !== '/package.json' && path !== '/dist' && !path.startsWith('/dist/app'),
    extraResource: ['dist/backend', 'dist/runtime', 'dist/node_modules', 'resources'],
    extendInfo: { LSMinimumSystemVersion: '13.0', NSHighResolutionCapable: true },
  },
  rebuildConfig: { onlyModules: [] },
  hooks: {
    postPackage: async (_config, { outputPaths }) => {
      for (const output of outputPaths) {
        const bundle = join(output, `${APP}.app`);
        const contents = join(bundle, 'Contents');
        await mkdir(join(contents, 'Library/LaunchAgents'), { recursive: true });
        await cp(
          'platform/macos/com.knoter.wiki-demo.worker.plist',
          join(contents, 'Library/LaunchAgents/com.knoter.wiki-demo.worker.plist'),
        );
        for (const name of ['KnoterServiceControl', 'KnoterServiceLauncher'])
          await cp(join('dist/native', name), join(contents, 'MacOS', name));
        execFileSync(
          '/usr/bin/codesign',
          ['--force', '--deep', '--sign', '-', bundle],
          { stdio: 'inherit' },
        );
        for (const name of ['KnoterServiceControl', 'KnoterServiceLauncher']) {
          const binary = join(contents, 'MacOS', name);
          execFileSync(
            '/usr/bin/codesign',
            ['--force', '--sign', '-', '--identifier', `com.knoter.wiki-demo.${name}`, binary],
            { stdio: 'inherit' },
          );
        }
        execFileSync(
          '/usr/bin/codesign',
          ['--force', '--sign', '-', bundle],
          { stdio: 'inherit' },
        );
      }
    },
  },
};
