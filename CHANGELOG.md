# Changelog

## [0.6.1](https://github.com/mrozio13pl/pimux/compare/v0.6.0...v0.6.1) (2026-09-11)


### Fixes

* **settings:** automatic archiving ([35b597f](https://github.com/mrozio13pl/pimux/commit/35b597fda35850e782493f35da09dabca80cb346))
* show attention status only on questions ([c65a0f1](https://github.com/mrozio13pl/pimux/commit/c65a0f11600ac6236680612330be64d7237e63d1))
* **sources:** native paste and working page keys ([2539fc1](https://github.com/mrozio13pl/pimux/commit/2539fc1bdec21e9f233511aed9b4aff8f0c63dda))


### Improvements

* drop input wait message ([10d7e48](https://github.com/mrozio13pl/pimux/commit/10d7e4879b51894b7689c729f0871d851f9550d1))
* new views always at the top ([52b8aee](https://github.com/mrozio13pl/pimux/commit/52b8aeefc5f0186310c334907c953a180309b537))

## [0.6.0](https://github.com/mrozio13pl/pimux/compare/v0.5.1...v0.6.0) (2026-09-06)


### Features

* add attention status ([24dc5e0](https://github.com/mrozio13pl/pimux/commit/24dc5e0376cb3d5a15a05c08a4293fe2b59aceb6))
* run pty in daemon ([e416dac](https://github.com/mrozio13pl/pimux/commit/e416dac472895d4b61b4b2d6f1e1de3ec31b762c))


### Fixes

* **claude:** idle waiting for input status ([3ac1164](https://github.com/mrozio13pl/pimux/commit/3ac1164023625c01435e9c67743793f03043d577))
* **claude:** image clipboard ([c965d2b](https://github.com/mrozio13pl/pimux/commit/c965d2bb9b82e13e90dc30c2f025f38b69a1908f))

## [0.5.1](https://github.com/mrozio13pl/pimux/compare/v0.5.0...v0.5.1) (2026-09-01)


### Fixes

* **pi:** clear compacting sidebar status ([445a9b9](https://github.com/mrozio13pl/pimux/commit/445a9b9f96cbe6696a352cb0401d30b340c712f0))


### Improvements

* add copy path to view context menu ([ef2d66e](https://github.com/mrozio13pl/pimux/commit/ef2d66ed584f8b79d05b600ea4aba952b6de9475))
* add shortened path setting ([6b5ee36](https://github.com/mrozio13pl/pimux/commit/6b5ee365a445070c0d1a3929b887e92adf302b69))
* allow overriding built-in source commands ([5897190](https://github.com/mrozio13pl/pimux/commit/5897190d932147f3f692ebea69cd71b29991180d))
* complex source commands ([5c86030](https://github.com/mrozio13pl/pimux/commit/5c86030eb09dcdb032d035e9850b95f81f6e1b04))

## [0.5.0](https://github.com/mrozio13pl/pimux/compare/v0.4.0...v0.5.0) (2026-08-03)


### Features

* add global command palette ([3f1f254](https://github.com/mrozio13pl/pimux/commit/3f1f2542b26fd4952c3d1d1b9e2fcea068ab44ed))
* archive inactive views ([a7a549b](https://github.com/mrozio13pl/pimux/commit/a7a549b1f3fc4d11754f91eb1f29afdbc8ad707b))
* claude code source (experimental) ([a6b272e](https://github.com/mrozio13pl/pimux/commit/a6b272e20f0e7bf3aec8d330111d9dc9fa2f9b7e))
* session and view search ([3c3c9b6](https://github.com/mrozio13pl/pimux/commit/3c3c9b639841cbda5f3e4e575ea7dd313de971cc))
* start complete revamp for 0.5.0 ([ce70715](https://github.com/mrozio13pl/pimux/commit/ce70715dd8e9c2788916fff912cab3181698e0b0))
* unify searchable settings ([64cb068](https://github.com/mrozio13pl/pimux/commit/64cb0686382a4e52a5453dc7168c7a645917d345))


### Fixes

* avoid redundant terminal renders ([89ef6df](https://github.com/mrozio13pl/pimux/commit/89ef6df9ba7a5d99ea498996f85a049e8547d724))
* load terminal wasm in production ([0c209e0](https://github.com/mrozio13pl/pimux/commit/0c209e08fb5dbf50d7f9bc187bd635810db69d9f))
* pi image pasting ([aa239c9](https://github.com/mrozio13pl/pimux/commit/aa239c9c6d42f6676900a208395cb8f21e11fa45))
* **pi:** route native image paste to PTY ([ecd2429](https://github.com/mrozio13pl/pimux/commit/ecd242982e2f01628c4381436579a8451845aeb4))
* preserve terminal process on settings changes ([5ecee52](https://github.com/mrozio13pl/pimux/commit/5ecee5296d605db09ffc2170c41111a344da6ef9))
* render terminal custom glyphs ([f531319](https://github.com/mrozio13pl/pimux/commit/f531319d668b0408ce030d9f100fa258c1aff19f))
* restore previous view on close ([e9924ed](https://github.com/mrozio13pl/pimux/commit/e9924edcf6174ac738c7fac23f6341937681898c))
* restore settings type safety ([7f0b3b3](https://github.com/mrozio13pl/pimux/commit/7f0b3b3ef716aa6da2a4d6ec4fc06d1727a5ecda))
* terminal scroll behavior ([8f772be](https://github.com/mrozio13pl/pimux/commit/8f772be5bc423238cd49dfee127a03a515cca56e))


### Improvements

* archive hotkey ([ab91d09](https://github.com/mrozio13pl/pimux/commit/ab91d09539c8c5145a5d4f2334bc47fd4edfaf13))
* suspend inactive terminals ([28fd817](https://github.com/mrozio13pl/pimux/commit/28fd8175f9e62dc8fb8282048ba6dad49558adad))
* suspend inactive terminals ([f106014](https://github.com/mrozio13pl/pimux/commit/f1060143db9feecfa766bfd2d7fef0bf57326ac4))
