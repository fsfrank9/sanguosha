(function () {
  'use strict';

  var data = window.SanguoshaData || (window.SanguoshaData = {});

      var IMPLEMENTED_SKILL_IDS = [
        'zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing',
        'paoxiao', 'wusheng', 'longdan', 'qingguo', 'jianxiong', 'ganglie', 'fankui', 'mashu', 'qicai', 'qianxun', 'tiandu', 'yiji', 'luoyi', 'tieqi', 'tuxi', 'yingzi', 'kongcheng',
        'biyue', 'keji', 'jizhi'
      ];
      var ACTIVE_SKILL_IDS = ['zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing'];

      data.IMPLEMENTED_SKILL_IDS = IMPLEMENTED_SKILL_IDS;
      data.ACTIVE_SKILL_IDS = ACTIVE_SKILL_IDS;
}());
