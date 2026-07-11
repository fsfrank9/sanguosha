      import { SkillRuntime } from './skill-runtime.js';

      export function installStandardSkillHandlers(skillRegistry, deps) {
        var hasSkill = deps.hasSkill;
        var opponent = deps.opponent;
        var actorName = deps.actorName;
        var isShaType = deps.isShaType;
        var log = deps.log;
        var takeHandCard = deps.takeHandCard;
        var triggerBiyue = deps.triggerBiyue;
        var triggerKejiBeforeDiscard = deps.triggerKejiBeforeDiscard;
        var triggerJizhi = deps.triggerJizhi;
        var triggerLuoyiDrawPhase = deps.triggerLuoyiDrawPhase;
        var triggerLuoyiDamageModify = deps.triggerLuoyiDamageModify;
        var triggerQianxunCardTarget = deps.triggerQianxunCardTarget;
        var triggerTongjiCardTarget = deps.triggerTongjiCardTarget;
        var triggerTianduJudgementAfterResolve = deps.triggerTianduJudgementAfterResolve;
        var triggerGuicaiJudgementBeforeResolve = deps.triggerGuicaiJudgementBeforeResolve;
        var triggerTieqiNeedResponse = deps.triggerTieqiNeedResponse;
        var triggerJianxiongDamageAfter = deps.triggerJianxiongDamageAfter;
        var triggerFankuiDamageAfter = deps.triggerFankuiDamageAfter;
        var triggerYijiDamageAfter = deps.triggerYijiDamageAfter;
        var triggerGanglieDamageAfter = deps.triggerGanglieDamageAfter;
        var triggerYaowuDamageAfter = deps.triggerYaowuDamageAfter;
        var triggerLongdanCardAs = deps.triggerLongdanCardAs;
        var triggerWushengCardAs = deps.triggerWushengCardAs;
        var triggerQingguoCardAs = deps.triggerQingguoCardAs;
        var triggerGuoseCardAs = deps.triggerGuoseCardAs;
        var triggerQixiCardAs = deps.triggerQixiCardAs;
        var triggerLiuliOnShaTargeted = deps.triggerLiuliOnShaTargeted;
        var triggerZhihengActiveSkill = deps.triggerZhihengActiveSkill;
        var triggerKurouActiveSkill = deps.triggerKurouActiveSkill;
        var triggerRendeActiveSkill = deps.triggerRendeActiveSkill;
        var triggerQingnangActiveSkill = deps.triggerQingnangActiveSkill;
        var triggerJieyinActiveSkill = deps.triggerJieyinActiveSkill;
        var triggerFanjianActiveSkill = deps.triggerFanjianActiveSkill;
        var triggerGuanxingActiveSkill = deps.triggerGuanxingActiveSkill;
        var triggerGuanxingPreview = deps.triggerGuanxingPreview;
        SkillRuntime.registerSkill(skillRegistry, 'biyue', {
        onTurnEnd: function (context) {
          triggerBiyue(context.game, context.actor);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'keji', {
        onBeforeDiscardPhase: function (context) {
          return triggerKejiBeforeDiscard(context.game, context.actor, context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'jizhi', {
        onCardUse: function (context) {
          return triggerJizhi(context.game, context.actor, context.card, context.options);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'yingzi', {
        onDrawPhase: function (context) {
          var state = context.game[context.actor];
          if (!state || !hasSkill(state, 'yingzi')) return;
          context.drawCount += 1;
          log(context.game, actorName(context.game, context.actor) + '发动【英姿】，摸牌阶段额外摸一张牌。');
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'tuxi', {
        onDrawPhase: function (context) {
          var game = context.game;
          var actor = context.actor;
          var state = game[actor];
          if (!state || !hasSkill(state, 'tuxi')) return;
          if (game[opponent(actor)].hand.length <= 0) return;
            // v6.1: spec condition is "发动者**选择**发动". Read
            // skillPreferences.tuxi to honor the choice: 'decline' skips
            // entirely. Default is auto-fire (preserves v5/v6 behavior so
            // existing tests + AI continue to work without per-turn toggles).
          var pref = state.skillPreferences && state.skillPreferences.tuxi;
          if (pref === 'decline') {
            log(game, actorName(game, actor) + '选择本回合不发动【突袭】。');
            return;
          }
          takeHandCard(game, opponent(actor), actor, '发动【突袭】，获得');
          context.drawCount = Math.max(0, context.drawCount - 1);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'luoyi', {
        onDrawPhase: function (context) {
          return triggerLuoyiDrawPhase(context);
        },
        onDamageModify: function (context) {
          return triggerLuoyiDamageModify(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'kongcheng', {
        onCardTarget: function (context) {
          var target = context.game[context.targetActor];
          if (!target || !hasSkill(target, 'kongcheng') || target.hand.length !== 0) return null;
          if (!isShaType(context.cardType) && context.cardType !== 'juedou') return null;
          return {
            protected: true,
            message: actorName(context.game, context.targetActor) + '处于【空城】状态，不能成为【' + context.cardName + '】目标。'
          };
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'qianxun', {
        onCardTarget: function (context) {
          return triggerQianxunCardTarget(context);
        }
      });
        // v11 C8 (批次 32): 同疾 (标袁术) — 1v1 恒不拦截的 reserved hook
        SkillRuntime.registerSkill(skillRegistry, 'tongji', {
        onCardTarget: function (context) {
          return triggerTongjiCardTarget(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'tiandu', {
        onJudgementAfterResolve: function (context) {
          return triggerTianduJudgementAfterResolve(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'guicai', {
        onJudgementBeforeResolve: function (context) {
          return triggerGuicaiJudgementBeforeResolve(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'tieqi', {
        onNeedResponse: function (context) {
          return triggerTieqiNeedResponse(context.game, context.actor, context.targetActor, context.responseType, context.card);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'jianxiong', {
        onDamageAfter: function (context) {
          return triggerJianxiongDamageAfter(context.game, context.targetActor, context.sourceCard);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'fankui', {
        onDamageAfter: function (context) {
          return triggerFankuiDamageAfter(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'yiji', {
        onDamageAfter: function (context) {
          return triggerYijiDamageAfter(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'ganglie', {
        onDamageAfter: function (context) {
          return triggerGanglieDamageAfter(context);
        }
      });
        // v11 C7 (批次 31): 耀武 (华雄) — 受红色杀伤害后, 来源二选一奖励
        SkillRuntime.registerSkill(skillRegistry, 'yaowu', {
        onDamageAfter: function (context) {
          return triggerYaowuDamageAfter(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'longdan', {
        onCardAs: function (context) {
          return triggerLongdanCardAs(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'wusheng', {
        onCardAs: function (context) {
          return triggerWushengCardAs(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'qingguo', {
        onCardAs: function (context) {
          return triggerQingguoCardAs(context);
        }
      });
        // v8 PR-C1: 国色 (大乔) onCardAs (方片 → 乐不思蜀, proactive only)
        SkillRuntime.registerSkill(skillRegistry, 'guose', {
        onCardAs: function (context) {
          return triggerGuoseCardAs(context);
        }
      });
        // v11 C3 (批次 27): 奇袭 (甘宁) onCardAs (黑色牌 → 过河拆桥, proactive only)
        SkillRuntime.registerSkill(skillRegistry, 'qixi', {
        onCardAs: function (context) {
          return triggerQixiCardAs(context);
        }
      });
        // v8 PR-C2: 流离 (大乔) onShaTargeted — 杀指定目标后 大乔 可弃 1 牌
        // 把杀转移给"攻击范围内的一名其他角色 (且必须为源此【杀】的合法目标)"。
        // 1v1 中可候选 = 仅源, 但源对自己不能用杀 → 0 合法目标 → 静默不触发。
        // 多人模式启用后此 hook 自动生效。
        SkillRuntime.registerSkill(skillRegistry, 'liuli', {
        onShaTargeted: function (context) {
          return triggerLiuliOnShaTargeted(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'zhiheng', {
        onActiveSkill: function (context) {
          return triggerZhihengActiveSkill(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'kurou', {
        onActiveSkill: function (context) {
          return triggerKurouActiveSkill(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'rende', {
        onActiveSkill: function (context) {
          return triggerRendeActiveSkill(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'qingnang', {
        onActiveSkill: function (context) {
          return triggerQingnangActiveSkill(context);
        }
      });
        // v11 C6 (批次 30): 结姻 (孙尚香) — 出牌阶段限一次的主动技
        SkillRuntime.registerSkill(skillRegistry, 'jieyin', {
        onActiveSkill: function (context) {
          return triggerJieyinActiveSkill(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'fanjian', {
        onActiveSkill: function (context) {
          return triggerFanjianActiveSkill(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'guanxing', {
        onActiveSkill: function (context) {
          return triggerGuanxingActiveSkill(context);
        },
        onSkillPreview: function (context) {
          return triggerGuanxingPreview(context);
        }
      });

      }

      export const PLAY_PHASE_ACTIVE_SKILLS = {
        zhiheng: true,
        kurou: true,
        rende: true,
        fanjian: true,
        qingnang: true,
          // v11 C6 (批次 30): 结姻
        jieyin: true
      };

