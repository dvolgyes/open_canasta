The full-match study uses commit `f98137c` with the attached [source patch](modern-retention-eight-source.patch.gz).
The SHA-256 of the uncompressed patch is `c2ffb95b516bde815458f576c9223fd9408522bf060e00e9359fba6b178e7f2f`.
Before the study starts, the isolated worktree's `src` and `scripts` directories and both study configurations match the staged workspace byte for byte.
The targeted tests and TypeScript check pass on the staged workspace.
The full check timed out in the existing research CLI test under high machine load, while 1,966 other tests passed.
The same test also timed out on the unchanged earlier source under the same load.
The study source remains staged until the required repository checks pass.
