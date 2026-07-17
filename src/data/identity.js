      // v12 H5: 身份场配置表 — 座次顺序即分配顺序 (首位恒主公先手)。
      // v13 K1: 3/4/5 人档全部现役 — 4 人档为官方 主/忠/反/内 各一,
      // 5 人档 主/忠/反/反/内; 内奸胜负条款见 damage-dying determineWinner。
      var IDENTITY_PRESETS = {
        3: ['主公', '反贼', '忠臣'],
        4: ['主公', '忠臣', '反贼', '内奸'],
        5: ['主公', '忠臣', '反贼', '反贼', '内奸']
      };

      // 身份 → 阵营归属 (胜负判定用)。内奸自成一方。
      var ROLE_SIDES = {
        '主公': 'lordSide',
        '忠臣': 'lordSide',
        '反贼': 'rebelSide',
        '内奸': 'renegade'
      };

      export { IDENTITY_PRESETS, ROLE_SIDES };
