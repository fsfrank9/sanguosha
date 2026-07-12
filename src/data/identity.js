      // v12 H5: 身份场配置表 — 座次顺序即分配顺序 (首位恒主公先手)。
      // 3 人为现役阵型; 5 人 (含内奸) 为预留配置, 引擎胜负判定已按
      // lordSide/rebelSide 阵营写就, 内奸胜利条件随 5 人批次接入。
      var IDENTITY_PRESETS = {
        3: ['主公', '反贼', '忠臣'],
        5: ['主公', '忠臣', '反贼', '反贼', '内奸']
      };

      // 身份 → 阵营归属 (胜负判定用)。内奸自成一方 (预留)。
      var ROLE_SIDES = {
        '主公': 'lordSide',
        '忠臣': 'lordSide',
        '反贼': 'rebelSide',
        '内奸': 'renegade'
      };

      export { IDENTITY_PRESETS, ROLE_SIDES };
