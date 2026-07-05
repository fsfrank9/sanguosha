// v11 A3: UI 面板行为测试共享开局 helper。
// 通过真实 lobby 流程开一局并整形成确定性局面。两处对 fake-DOM 的加固:
//   1. 入 setup 自动随机身份, 主公先手 — 敌方主公时 enemyThinking=true 且
//      只有 (测试从不 flush 的) enemyStep 计时器会清它, 手牌点击会被
//      usePlayerCard 守卫拦下。重进 lobby 重掷身份直到玩家先手。
//   2. index.html 里 exitConfirmModal 自带 hidden 属性; fake-DOM 惰性元素
//      默认可见, 会污染 _firstVisibleDispatch (handConfirm 落空时误点
//      "确认退出"), 需按真实初始态藏起。
export function makeStartGameViaUI($, UI) {
  return function startGameViaUI(playerHero = 'liubei', enemyHero = 'sunquan') {
    $('lobby1v1Btn').click();
    $('playerHeroSelect').value = playerHero;
    $('enemyHeroSelect').value = enemyHero;
    $('startGameBtn').click();
    for (let retry = 0; UI.getGame().turn !== 'player' && retry < 40; retry += 1) {
      $('lobby1v1Btn').click();
      $('playerHeroSelect').value = playerHero;
      $('enemyHeroSelect').value = enemyHero;
      $('startGameBtn').click();
    }
    $('exitConfirmModal').hidden = true;
    const game = UI.getGame();
    game.turn = 'player';
    game.phase = 'play';
    game.player.hand = [];
    game.enemy.hand = [];
    game.player.hp = game.player.maxHp;
    game.enemy.hp = game.enemy.maxHp;
    game.player.judgeArea = [];
    game.enemy.judgeArea = [];
    game.player.equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game.enemy.equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game.pendingChoice = null;
    game.pendingChoiceQueue = [];
    game.pauseState = {};
    UI.render();
    return game;
  };
}
