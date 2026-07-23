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
        // v13 J0-2: 判定前无懈窗口 (tricks 域无懈链, 引擎装配注入)
        var checkWuxieAndContinue = deps.checkWuxieAndContinue;

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
        // 同款"临时改写 + 收尾还原"手法, 物理牌入弃牌堆前还原, 不污染牌堆。
        applyHongyanJudgementView(game, actor, judgementContext.card);
        return judgementContext.card;
      }

      // v12 G2 复核修复: 视图施加/还原中心化 — 除 judge()/resolveJudgementCard
      // 自身外, 鬼才/鬼道 ask 路径的改判 resolver 也要用 (原判定牌不经
      // resolveJudgementCard 离场、替换牌不经 judge() 施加视图, 两个方向
      // 都曾泄漏: 物理牌花色被永久改写 / 红颜对替换牌失效)。
      function applyHongyanJudgementView(game, actor, card) {
        if (card && card.suit === 'spade' && !card.hongyanOriginalSuit
            && StateRuntime.hasSkill(game[actor], 'hongyan')) {
          card.hongyanOriginalSuit = 'spade';
          card.hongyanOriginalColor = card.color;
          card.suit = 'heart';
          card.color = 'red';
          log(game, actorName(game, actor) + '的【红颜】生效，判定牌黑桃视为红桃。');
        }
        return card;
      }

      function restoreHongyanJudgementView(card) {
        if (card && card.hongyanOriginalSuit) {
          card.suit = card.hongyanOriginalSuit;
          card.color = card.hongyanOriginalColor;
          delete card.hongyanOriginalSuit;
          delete card.hongyanOriginalColor;
        }
        return card;
      }

      function resolveJudgementCard(game, actor, state, reason, card) {
        if (!card) return;
        // v12 G2: 红颜视图还原 — 物理牌离开判定结算前恢复原花色。
        restoreHongyanJudgementView(card);
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
      // (e.g. 鬼才 prompting / v13 判定前无懈) is held on
      // game.pauseState.judgeArea so the same function can resume from the
      // right trick index after the player resolves the prompt.
      function processJudgeArea(game, actor) {
        var state = game[actor];
        state.flags = state.flags || {};
        if (!game.pauseState) game.pauseState = {};
        var saved = game.pauseState.judgeArea;
        var pending;
        var startIdx;
        var wuxieDoneIdx;
        var wuxieResults;
        if (saved && saved.actor === actor) {
          pending = saved.pending;
          startIdx = saved.idx;
          wuxieDoneIdx = (saved.wuxieDoneIdx === undefined) ? -1 : saved.wuxieDoneIdx;
          wuxieResults = saved.wuxieResults || {};
        } else {
          // v12 G2 修复: 此处原有 skipPlay/skipDraw 复位与 resetActorTurnState
          // 的回合开始复位冗余, 且会清掉准备阶段 (神速选项二) 刚设置的
          // skipPlay — 神速"仅选项二"因此失效。回合级复位职责归 phases.js,
          // 判定阶段只负责让 乐不思蜀/兵粮 的 outcome 重新置位。
          if (!state.judgeArea) state.judgeArea = [];
          // 整批取出判定区待结算牌 (在途), 逐张结算后 discardCard / 移动。
          // v13 J0-2: 官方判定阶段结算顺序为 LIFO — "进行其中最后置入其判定
          // 区里的那张延时类锦囊牌的使用结算，然后重复此流程" (flow__game.md
          // 判定阶段) → 整批倒序。每张牌本阶段只结算一次 (结算中新置入本区
          // 的牌 — 如闪电移动失败回到自己 — 不在本阶段重复结算)。
          pending = state.judgeArea.splice(0);
          pending.reverse();
          startIdx = 0;
          wuxieDoneIdx = -1;
          wuxieResults = {};
        }
        for (var i = startIdx; i < pending.length; i += 1) {
          // v12 H5: 该角色已在判定结算中阵亡 (闪电, 身份场对局继续) —
          // 剩余在途延时锦囊直接置入弃牌堆, 不再为亡者结算。
          if (game[actor].hp <= 0) {
            for (var deadRest = i; deadRest < pending.length; deadRest += 1) {
              discardCard(game, pending[deadRest]);
            }
            if (game.pauseState && game.pauseState.judgeArea) game.pauseState.judgeArea = null;
            return { ok: true };
          }
          var trick = pending[i];
          var reason = judgementReasonFor(trick);
          // v13 J0-2 (PR #165 缺陷 2): 判定前无懈窗口 — 官方无懈时机为
          // "一张锦囊牌对一个目标生效前" (card__scroll.md:78), 延时锦囊的
          // 生效即判定结算 (flow__use.md:133)。放置时不再询问 (game-engine
          // playDelayedCardHandler), 此处在每张延时锦囊判定前开链:
          //   - 同步 settle (全 AI 放弃/使用) → continuation 把结果写回快照,
          //     本循环随即消费;
          //   - 玩家 ask 挂起 → 返回 suspended, settle 后 continuation 置
          //     wuxieSettled, 由 resumeSuspendedTurnFlowIfReady 续跑本函数。
          if (reason && checkWuxieAndContinue && wuxieDoneIdx < i) {
            game.pauseState.judgeArea = {
              actor: actor,
              pending: pending,
              idx: i,
              wuxieDoneIdx: wuxieDoneIdx,
              wuxieResults: wuxieResults,
              awaitingWuxie: true
            };
            checkWuxieAndContinue(game, actor, reason, 'delayed-judge', {
              // 张角三修 (#3): 延时锦囊判定的使用结算"无使用者"
              // (glossary__gamecard: 置入判定区后"无使用者"的使用结算) → 无懈
              // 窗口不跳过任何座席, 放置者也应被询问/纳入 (官方: 任何角色可在
              // 判定牌生效前打出无懈)。此前 actor=放置者 令其被"净通过跳过来源"
              // 逻辑排除, 玩家放置的延时锦囊判定前得不到询问 (用户实测)。
              // AI 放置者不乱耗由 aiShouldUseWuxie 保证: 立场过滤 (按受害者=判定区
              // 归属者 ctx.ownerActor) 先于 wuxiePolicy='always' 早退 — 消己方打给
              // 敌方的延时锦囊不符立场 → 恒保留 (张角三修同批修正 ai.js 过滤顺序)。
              actor: null,
              ownerActor: actor,
              trickIdx: i,
              trickType: trick.type
            });
            if (game.pendingChoice) return { suspended: true };
            saved = game.pauseState.judgeArea;
            wuxieDoneIdx = (saved && saved.wuxieDoneIdx !== undefined) ? saved.wuxieDoneIdx : i;
            wuxieResults = (saved && saved.wuxieResults) || wuxieResults;
            if (saved) saved.wuxieSettled = false;
          }
          if (reason && wuxieResults[i]) {
            // 被无懈: 乐/兵 → 置入弃牌堆; 闪电 → 不判定, 按官方移动规则走
            // ("目标角色被取消后…将对应的实体牌置入其下家的判定区",
            // card__scroll.md:207)。
            log(game, '【' + trick.name + '】对' + actorName(game, actor) + '的效果被【无懈可击】抵消。');
            if (trick.type === 'shandian') {
              moveShandianOnward(game, actor, trick);
            } else {
              discardCard(game, trick);
            }
            continue;
          }
          var judgementCard = reason ? judge(game, actor, reason, { pausable: true }) : null;
          if (game.pendingChoice) {
            // judge() invoked a hook that asked for a choice. Snapshot the
            // iteration so resolvePendingChoice can pick up where we left off.
            game.pauseState.judgeArea = {
              actor: actor,
              pending: pending,
              idx: i,
              wuxieDoneIdx: wuxieDoneIdx,
              wuxieResults: wuxieResults,
              currentTrick: trick,
              currentReason: reason,
              currentJudgementCard: judgementCard
            };
            return { suspended: true };
          }
          applyJudgeAreaOutcome(game, actor, state, trick, reason, judgementCard);
          if (game.phase === 'gameover') {
            // v12 H5 修复: 判定结算致终局时, 剩余在途延时锦囊 (已从判定区
            // 整批取出) 一并入弃牌堆 — 否则从所有区域凭空消失 (守恒破坏,
            // 叠放多张延时锦囊 + 首张致死场景)。
            for (var overRest = i + 1; overRest < pending.length; overRest += 1) {
              discardCard(game, pending[overRest]);
            }
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
              wuxieDoneIdx: wuxieDoneIdx,
              wuxieResults: wuxieResults,
              outcomeApplied: true
            };
            return { suspended: true };
          }
        }
        // Clear the snapshot if we exited cleanly.
        if (game.pauseState && game.pauseState.judgeArea) game.pauseState.judgeArea = null;
        return { ok: true };
      }

      // v13 J0-2: 闪电移动规则 (官方 card__scroll.md:207 — 使用结算结束后/
      // 目标角色被取消后): 自下家起顺时针找首个判定区无同名【闪电】的存活
      // 座席; 全部不合法 → 回到自己的判定区。判定不命中 (applyJudgeAreaOutcome
      // 的 moveToNext) 与被无懈 (processJudgeArea) 共用。
      function moveShandianOnward(game, actor, trick) {
        var moved = false;
        var ring = StateRuntime.seatsFrom(game, actor, false);
        for (var ringIdx = 0; ringIdx < ring.length; ringIdx += 1) {
          var candActor = ring[ringIdx];
          var candState = game[candActor];
          if (!candState || candState.hp <= 0) continue;
          var candAlreadyShandian = (candState.judgeArea || []).some(function (j) {
            return j && j.type === 'shandian';
          });
          if (candAlreadyShandian) continue;
          putCard(game, trick, { zone: 'judgeArea', actor: candActor });
          log(game, '【闪电】移至' + actorName(game, candActor) + '的判定区。');
          moved = true;
          break;
        }
        if (!moved) {
          // 后续座席均非合法目标 → 回到自己
          putCard(game, trick, { zone: 'judgeArea', actor: actor });
          log(game, '【闪电】移动失败（对手判定区已有同名牌），留在' + actorName(game, actor) + '的判定区。');
        }
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
          // v7 PR-12: gltjk card__scroll.md 注 — 座次环移动规则; v13 J0-2:
          // 抽出为 moveShandianOnward, 与"被无懈后移动"共用。
          moveShandianOnward(game, actor, trick);
        }
        resolveJudgementCard(game, actor, state, reason, judgementCard);
        if (outcome.discardTrick) discardCard(game, trick);
      }


        return {
          judge: judge,
        applyHongyanJudgementView: applyHongyanJudgementView,
        restoreHongyanJudgementView: restoreHongyanJudgementView,
          resolveJudgementCard: resolveJudgementCard,
          judgementReasonFor: judgementReasonFor,
          processJudgeArea: processJudgeArea,
          applyJudgeAreaOutcome: applyJudgeAreaOutcome,
          moveShandianOnward: moveShandianOnward
        };
      }
