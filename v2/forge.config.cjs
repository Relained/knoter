const { join } = require('node:path');
const { mkdir, cp } = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
module.exports = {
  packagerConfig: {
    name: 'Knoter Wiki Demo',
    executableName: 'Knoter Wiki Demo',
    appBundleId: 'com.knoter.wiki-demo',
    appCategoryType: 'public.app-category.productivity',
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
        const contents = join(output, 'Knoter Wiki Demo.app', 'Contents');
        await mkdir(join(contents, 'Library/LaunchAgents'), { recursive: true });
        await cp(
          'platform/macos/com.knoter.wiki-demo.worker.plist',
          join(contents, 'Library/LaunchAgents/com.knoter.wiki-demo.worker.plist'),
        );
        for (const name of ['KnoterServiceControl', 'KnoterServiceLauncher'])
          await cp(join('dist/native', name), join(contents, 'MacOS', name));
        execFileSync(
          '/usr/bin/codesign',
          ['--force', '--deep', '--sign', '-', join(output, 'Knoter Wiki Demo.app')],
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
          ['--force', '--sign', '-', join(output, 'Knoter Wiki Demo.app')],
          { stdio: 'inherit' },
        );
      }
    },
  },
};
