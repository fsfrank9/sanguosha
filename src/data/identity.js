      // v12 H5: 身份场配置表 — 座次顺序即分配顺序 (首位恒主公先手)。
      // v13 K1/K3: 3/4/5 人档全部现役 — 官方构成 4 人 1主1忠1反1内 /
      // 5 人 1主1忠2反1内 (官方身份系暗抽随机, 座次由本项目固定预设,
      // 顺序对齐座席语义: enemy=反贼 / ally=忠臣, 与 3 人档一致, UI 席位
      // 文案不误导); 内奸胜负条款见 damage-dying determineWinner。
      var IDENTITY_PRESETS = {
        3: ['主公', '反贼', '忠臣'],
        4: ['主公', '反贼', '忠臣', '内奸'],
        5: ['主公', '反贼', '忠臣', '反贼', '内奸']
      };

      // 身份 → 阵营归属 (胜负判定用)。内奸自成一方。
      var ROLE_SIDES = {
        '主公': 'lordSide',
        '忠臣': 'lordSide',
        '反贼': 'rebelSide',
        '内奸': 'renegade'
      };

      export { IDENTITY_PRESETS, ROLE_SIDES };
