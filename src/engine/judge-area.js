      import { SkillRuntime } from './skill-runtime.js';
      import { StateRuntime } from './state.js';

      export function createJudgeAreaRuntime(deps) {
        var skillRegistry = deps.skillRegistry;
        var reshuffleIfNeeded = deps.reshuffleIfNeeded;
        var takeCard = deps.takeCard;
        var putCard = deps.putCard;
        var discardCard = deps.discardCard;
        var log = deps.log;
        var actorName = deps.actorName;
        var evaluateDelayedTrick = deps.evaluateDelayedTrick;
        var damage = deps.damage;
        var opponent = deps.opponent;

      function judge(game, actor, reason, opts) {
        reshuffleIfNeeded(game);
        // 判定牌离开牌堆进入在途结算, 结算收尾统一 discardCard (或被天妒等收走)。
        var card = takeCard(game, null, { zone: 'deck' });
        if (!card) return null;
        log(game, actorName(game, actor) + '进行' + reason + '判定：【' + card.name + '】' + card.suit + ' ' + card.rank + '。');
        var state = game[actor];
        var judgementContext = {
          game: game,
          actor: actor,
          state: state,
          reason: reason,
          card: card,
          originalCard: card,
          replaced: false,
          // v6.1: only processJudgeArea's caller can suspend a judgement
          // mid-resolution (it has the pauseState snapshot to resume from).
          // Other callers (bagua armor judge, ganglie judge, tieqi judge)
          // run judge() inside their own multi-step logic with no resume
          // point, so 鬼才 falls back to auto-fire there. processJudgeArea
          // passes `{ pausable: true }`; others leave the default false.
          pausable: !!(opts && opts.pausable)
        };
        SkillRuntime.runHook(skillRegistry, 'onJudgementBeforeResolve', judgementContext);
        // v12 G2: 红颜 (小乔) — 锁定技: 判定归属者的黑桃判定牌视为红桃。
        // 时机在改判 (鬼才/鬼道) 之后, 对最终生效的判定牌应用; 采用朱雀
        // 同款"临时改写 + 收尾还原"手法, 物理牌入弃牌堆前由
        // resolveJudgementCard 还原, 不污染牌堆。
        var finalCard = judgementContext.card;
        if (finalCard && finalCard.suit === 'spade'
            && StateRuntime.hasSkill(game[actor], 'hongyan')) {
          finalCard.hongyanOriginalSuit = 'spade';
          finalCard.hongyanOriginalColor = finalCard.color;
          finalCard.suit = 'heart';
          finalCard.color = 'red';
          log(game, actorName(game, actor) + '的【红颜】生效，判定牌黑桃视为红桃。');
        }
        return judgementContext.card;
      }

      function resolveJudgementCard(game, actor, state, reason, card) {
        if (!card) return;
        // v12 G2: 红颜视图还原 — 物理牌离开判定结算前恢复原花色。
        if (card.hongyanOriginalSuit) {
          card.suit = card.hongyanOriginalSuit;
          card.color = card.hongyanOriginalColor;
          delete card.hongyanOriginalSuit;
          delete card.hongyanOriginalColor;
        }
        var judgementContext = {
          game: game,
          actor: actor,
          state: state,
          reason: reason,
          card: card
        };
        SkillRuntime.runHook(skillRegistry, 'onJudgementAfterResolve', judgementContext);
        if (!judgementContext.claimed) {
          discardCard(game, card);
        }
      }

      function judgementReasonFor(trick) {
        if (!trick) return null;
        if (trick.type === 'lebusishu') return '【乐不思蜀】';
        if (trick.type === 'bingliang') return '【兵粮寸断】';
        if (trick.type === 'shandian') return '【闪电】';
        return null;
      }

      // Re-entrant judge-area processor. State that needs to survive a pause
      // (e.g. 鬼才 prompting) is held on game.pauseState.judgeArea so the
      // same function can resume from the right trick index after the player
      // resolves the prompt.
      function processJudgeArea(game, actor) {
        var state = game[actor];
        state.flags = state.flags || {};
        if (!game.pauseState) game.pauseState = {};
        var saved = game.pauseState.judgeArea;
        var pending;
        var startIdx;
        if (saved && saved.actor === actor) {
          pending = saved.pending;
          startIdx = saved.idx;
        } else {
          // v12 G2 修复: 此处原有 skipPlay/skipDraw 复位与 resetActorTurnState
          // 的回合开始复位冗余, 且会清掉准备阶段 (神速选项二) 刚设置的
          // skipPlay — 神速"仅选项二"因此失效。回合级复位职责归 phases.js,
          // 判定阶段只负责让 乐不思蜀/兵粮 的 outcome 重新置位。
          if (!state.judgeArea) state.judgeArea = [];
          // 整批取出判定区待结算牌 (在途), 逐张结算后 discardCard / 移动。
          pending = state.judgeArea.splice(0);
          startIdx = 0;
        }
        for (var i = startIdx; i < pending.length; i += 1) {
          var trick = pending[i];
          var reason = judgementReasonFor(trick);
          var judgementCard = reason ? judge(game, actor, reason, { pausable: true }) : null;
          if (game.pendingChoice) {
            // judge() invoked a hook that asked for a choice. Snapshot the
            // iteration so resolvePendingChoice can pick up where we left off.
            game.pauseState.judgeArea = {
              actor: actor,
              pending: pending,
              idx: i,
              currentTrick: trick,
              currentReason: reason,
              currentJudgementCard: judgementCard
            };
            return { suspended: true };
          }
          applyJudgeAreaOutcome(game, actor, state, trick, reason, judgementCard);
          if (game.phase === 'gameover') {
            if (game.pauseState && game.pauseState.judgeArea) game.pauseState.judgeArea = null;
            return { ok: true };
          }
          if (game.pendingChoice) {
            // H2: outcome 结算本身产生了待玩家选择 (如【闪电】命中致濒死求桃 /
            // 遗计逐点分配)。此前这里不检查, 濒死角色会带着挂起的 pendingChoice
            // 照常摸牌进入出牌阶段。挂起并标记 outcomeApplied (idx 已前进),
            // 由 finishPendingChoiceResolution 在所有选择排空后续跑回合。
            game.pauseState.judgeArea = {
              actor: actor,
              pending: pending,
              idx: i + 1,
              outcomeApplied: true
            };
            return { suspended: true };
          }
        }
        // Clear the snapshot if we exited cleanly.
        if (game.pauseState && game.pauseState.judgeArea) game.pauseState.judgeArea = null;
        return { ok: true };
      }

      function applyJudgeAreaOutcome(game, actor, state, trick, reason, judgementCard) {
        var outcome = evaluateDelayedTrick(trick, judgementCard);
        if (outcome.skipPlay) {
          state.flags.skipPlay = true;
          log(game, actorName(game, actor) + '【乐不思蜀】判定失败，跳过出牌阶段。');
        }
        if (outcome.skipDraw) {
          state.flags.skipDraw = true;
          log(game, actorName(game, actor) + '【兵粮寸断】判定失败，跳过摸牌阶段。');
        }
        if (trick.type === 'shandian' && outcome.hit) {
          damage(game, actor, outcome.damage, null, '【闪电】');
        } else if (trick.type === 'shandian' && outcome.moveToNext) {
          // v7 PR-12: gltjk card__scroll.md 注 — "若其下家不是此【闪电】的
          // 合法目标，则将对应的实体牌置入其下家的下家的判定区，以此类推。
          // 若所有角色都不是此【闪电】的合法目标，则将对应的实体牌置入其
          // 判定区。" 在 1v1 中只有 2 名角色：下家=对手；下家的下家=自己。
          // PR-6 已定义 "判定区里有同名延时锦囊的角色 = 非合法目标"。
          var foeActor = opponent(actor);
          var foeState = game[foeActor];
          var foeAlreadyShandian = (foeState.judgeArea || []).some(function (j) {
            return j && j.type === 'shandian';
          });
          if (foeAlreadyShandian) {
            // 对手已有 闪电 → 非合法目标 → 全部不合法 → 回到自己
            putCard(game, trick, { zone: 'judgeArea', actor: actor });
            log(game, '【闪电】移动失败（对手判定区已有同名牌），留在' + actorName(game, actor) + '的判定区。');
          } else {
            putCard(game, trick, { zone: 'judgeArea', actor: foeActor });
            log(game, '【闪电】移至' + actorName(game, foeActor) + '的判定区。');
          }
        }
        resolveJudgementCard(game, actor, state, reason, judgementCard);
        if (outcome.discardTrick) discardCard(game, trick);
      }


        return {
          judge: judge,
          resolveJudgementCard: resolveJudgementCard,
          judgementReasonFor: judgementReasonFor,
          processJudgeArea: processJudgeArea,
          applyJudgeAreaOutcome: applyJudgeAreaOutcome
        };
      }
