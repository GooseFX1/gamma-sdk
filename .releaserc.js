module.exports = {
  branches: ['release/npm'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    ['@semantic-release/npm',{
      'tarballDir':'lib',
      'pkgRoot':'src'
    }],
    '@semantic-release/git',
  ],
};
