    (function () {
      'use strict';

      var MODULES = window.SanguoshaEngineModules || {};
      var Runtime = MODULES.Runtime;
      var SkillRuntime = MODULES.SkillRuntime;
      var CardRuntime = MODULES.CardRuntime;
      var StateRuntime = MODULES.StateRuntime;
      var PhaseRuntime = MODULES.PhaseRuntime;
      var JudgementRuntime = MODULES.JudgementRuntime;
      if (!Runtime || !SkillRuntime || !CardRuntime || !StateRuntime || !PhaseRuntime || !JudgementRuntime) {
        throw new Error('Sanguosha engine runtime modules must be loaded before the game engine.');
      }

      var DATA = Runtime.requireData([
        'HERO_CATALOG',
        'HEROES',
        'IMPLEMENTED_SKILL_IDS',
        'ACTIVE_SKILL_IDS',
        'CARD_CATALOG',
        'CARD_INFO',
        'PHASES'
      ]);
      var HERO_CATALOG = DATA.HERO_CATALOG;
      var HEROES = DATA.HEROES;
      var IMPLEMENTED_SKILL_IDS = DATA.IMPLEMENTED_SKILL_IDS;
      var ACTIVE_SKILL_IDS = DATA.ACTIVE_SKILL_IDS;
      var CARD_CATALOG = DATA.CARD_CATALOG;
      var CARD_INFO = DATA.CARD_INFO;
      var PHASES = DATA.PHASES;
      var clone = Runtime.clone;
      var makeRng = Runtime.makeRng;
      var makePlayer = Runtime.makePlayer;
      var makeTestCard = CardRuntime.makeTestCard;
      var buildDeck = CardRuntime.buildDeck;
      var shuffle = CardRuntime.shuffle;
      var isShaType = CardRuntime.isShaType;
      var isShaCard = CardRuntime.isShaCard;
      var isNormalTrickCard = CardRuntime.isNormalTrickCard;
      var physicalCardOf = CardRuntime.physicalCardOf;
      var actorName = StateRuntime.actorName;
      var opponent = StateRuntime.opponent;
      var hasSkill = StateRuntime.hasSkill;
      var canUseUnlimitedSha = StateRuntime.canUseUnlimitedSha;
      var weaponRange = StateRuntime.weaponRange;
      var distanceBetween = StateRuntime.distanceBetween;
      var canReachWithSha = StateRuntime.canReachWithSha;
      var firstActorFromRoles = StateRuntime.firstActorFromRoles;
      var handLimit = StateRuntime.handLimit;
      var getActorStatus = StateRuntime.getActorStatus;
      var setPhase = PhaseRuntime.setPhase;
      var nextPlayablePhase = PhaseRuntime.nextPlayablePhase;
      var resetActorTurnState = PhaseRuntime.resetActorTurnState;
      var resetEndOfTurnState = PhaseRuntime.resetEndOfTurnState;
      var evaluateDelayedTrick = JudgementRuntime.evaluateDelayedTrick;

      SkillRuntime.annotateSkillStatus(HERO_CATALOG, IMPLEMENTED_SKILL_IDS, ACTIVE_SKILL_IDS);

      function isKongchengProtected(game, targetActor, cardType) {
        var target = game[targetActor];
        return !!(target && hasSkill(target, 'kongcheng') && target.hand.length === 0 && (isShaType(cardType) || cardType === 'juedou'));
      }

      function takeHandCard(game, fromActor, toActor, reason) {
        var from = game[fromActor];
        var to = game[toActor];
        if (!from || !to || !from.hand.length) return null;
        var index = randomHandIndex(game, from);
        var card = from.hand.splice(index, 1)[0];
        to.hand.push(card);
        log(game, actorName(game, toActor) + (reason || '获得') + actorName(game, fromActor) + '的一张手牌。');
        return card;
      }

      function performDrawPhase(game, actor) {
        var state = game[actor];
        var drawCount = hasSkill(state, 'yingzi') ? 3 : 2;
        if (hasSkill(state, 'yingzi')) log(game, actorName(game, actor) + '发动【英姿】，摸牌阶段额外摸一张牌。');
        if (hasSkill(state, 'tuxi') && game[opponent(actor)].hand.length > 0) {
          takeHandCard(game, opponent(actor), actor, '发动【突袭】，获得');
          drawCount = Math.max(0, drawCount - 1);
        }
        return drawCards(game, actor, drawCount);
      }

      function isArmorIgnoredBySha(game, sourceActor, card) {
        var source = game[sourceActor];
        return !!(source && isShaCard(card) && source.equipment && source.equipment.weapon && source.equipment.weapon.type === 'qinggang');
      }

      function log(game, text) {
        game.log.push(text);
        if (game.log.length > 80) game.log.shift();
      }

      function reshuffleIfNeeded(game) {
        if (game.deck.length > 0 || game.discard.length === 0) return;
        log(game, '牌堆耗尽，洗混弃牌堆形成新的牌堆。');
        game.deck = shuffle(game.discard.splice(0), game.random);
      }

      function drawCards(game, actor, count) {
        var drawn = [];
        for (var i = 0; i < count; i += 1) {
          reshuffleIfNeeded(game);
          if (game.deck.length === 0) break;
          var card = game.deck.pop();
          game[actor].hand.push(card);
          drawn.push(card);
        }
        if (drawn.length > 0) {
          log(game, actorName(game, actor) + '摸了 ' + drawn.length + ' 张牌。');
        }
        return drawn;
      }

      function shouldTriggerJizhi(card, options) {
        return isNormalTrickCard(card) && !(card.type === 'tiesuo' && options && options.mode === 'recast');
      }

      function triggerJizhi(game, actor, card, options) {
        var state = game[actor];
        if (!state || !hasSkill(state, 'jizhi') || !shouldTriggerJizhi(card, options) || game.phase === 'gameover') return;
        log(game, actorName(game, actor) + '发动【集智】，使用普通锦囊后摸 1 张牌。');
        drawCards(game, actor, 1);
      }

      function finishTrickUse(game, actor, card, result, options) {
        if (result && result.ok) triggerJizhi(game, actor, card, options);
        return result;
      }

      function removeCardFromHand(state, cardId) {
        var index = state.hand.findIndex(function (card) { return card.id === cardId; });
        if (index < 0) return null;
        return state.hand.splice(index, 1)[0];
      }

      function removeFirstMatchingCard(state, predicate) {
        var index = state.hand.findIndex(predicate);
        if (index < 0) return null;
        return state.hand.splice(index, 1)[0];
      }

      function removeFirstCardOfType(state, type) {
        return removeFirstMatchingCard(state, function (card) { return type === 'sha' ? isShaCard(card) : card.type === type; });
      }

      function discardCard(game, card) {
        var physicalCard = physicalCardOf(card);
        if (physicalCard) game.discard.push(physicalCard);
      }

      function equipCard(game, actor, card) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        if (!card || card.family !== 'equipment') return fail('这不是装备牌。');
        var slot = card.slot || (CARD_CATALOG[card.type] && CARD_CATALOG[card.type].slot);
        if (!slot) return fail('装备槽位未知。');
        removeCardFromHand(self, card.id);
        if (self.equipment[slot]) {
          discardCard(game, self.equipment[slot]);
          log(game, actorName(game, actor) + '替换并弃置了原有装备【' + self.equipment[slot].name + '】。');
        }
        self.equipment[slot] = card;
        log(game, actorName(game, actor) + '装备了【' + card.name + '】。');
        return success('装备成功。');
      }

      function loseEquipment(game, actor, slot) {
        var self = game[actor];
        if (!self || !self.equipment) return fail('未知角色。');
        var card = self.equipment[slot];
        if (!card) return fail('该槽位没有装备。');
        self.equipment[slot] = null;
        discardCard(game, card);
        log(game, actorName(game, actor) + '失去了【' + card.name + '】。');
        if (card.type === 'baiyin' && self.hp > 0 && self.hp < self.maxHp) {
          self.hp = Math.min(self.maxHp, self.hp + 1);
          log(game, actorName(game, actor) + '因失去【白银狮子】回复 1 点体力。');
        }
        return success('失去装备。');
      }

      function applyWeaponHitEffects(game, actor, targetActor) {
        var weapon = game[actor].equipment && game[actor].equipment.weapon;
        if (!weapon) return;
        if (weapon.type === 'qilin') {
          if (game[targetActor].equipment.horsePlus) loseEquipment(game, targetActor, 'horsePlus');
          if (game[targetActor].equipment.horseMinus) loseEquipment(game, targetActor, 'horseMinus');
        } else if (weapon.type === 'cixiong') {
          if (game[targetActor].hand.length) {
            var dropped = game[targetActor].hand.splice(0, 1)[0];
            discardCard(game, dropped);
            log(game, actorName(game, targetActor) + '因【雌雄双股剑】弃置一张牌。');
          } else {
            drawCards(game, actor, 1);
            log(game, actorName(game, actor) + '因【雌雄双股剑】摸一张牌。');
          }
        }
      }

      function randomHandIndex(game, state) {
        if (!state.hand.length) return -1;
        return Math.floor(game.random() * state.hand.length);
      }

      function fail(message) {
        return { ok: false, message: message };
      }

      function success(message) {
        return { ok: true, message: message };
      }

      function damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature) {
        if (game.phase === 'gameover') return false;
        var target = game[targetActor];
        if (!target) return false;
        amount = Number(amount) || 0;
        var armor = target.equipment && target.equipment.armor;
        var ignoreArmor = !!(armor && sourceActor && sourceCard && isArmorIgnoredBySha(game, sourceActor, sourceCard));
        var damageNature = nature || 'normal';
        if (sourceCard && sourceCard.type === 'fire_sha') damageNature = 'fire';
        if (sourceCard && sourceCard.type === 'thunder_sha') damageNature = 'thunder';
        if (/火攻/.test(reason || '')) damageNature = 'fire';
        if (/闪电|雷/.test(reason || '')) damageNature = 'thunder';

        if (armor && !ignoreArmor && armor.type === 'tengjia') {
          if (damageNature === 'fire') {
            amount += 1;
            log(game, actorName(game, targetActor) + '的【藤甲】令火焰伤害 +1。');
          } else if ((sourceCard && sourceCard.type === 'sha') || /南蛮入侵|万箭齐发/.test(reason || '')) {
            log(game, actorName(game, targetActor) + '的【藤甲】防止了这次伤害。');
            if (sourceCard) discardCard(game, sourceCard);
            return false;
          }
        }

        if (armor && !ignoreArmor && armor.type === 'baiyin' && amount > 1) {
          amount = 1;
          log(game, actorName(game, targetActor) + '的【白银狮子】将伤害防止至 1 点。');
        }

        if (amount <= 0) {
          if (sourceCard) discardCard(game, sourceCard);
          return false;
        }
        target.hp = Math.max(0, target.hp - amount);
        log(game, actorName(game, targetActor) + '因' + reason + '受到 ' + amount + ' 点伤害。');
        var physicalSourceCard = physicalCardOf(sourceCard);
        if (sourceCard && physicalSourceCard && hasSkill(target, 'jianxiong')) {
          target.hand.push(physicalSourceCard);
          log(game, actorName(game, targetActor) + '发动【奸雄】，获得了造成伤害的【' + physicalSourceCard.name + '】。');
        } else if (sourceCard) {
          discardCard(game, sourceCard);
        }
        if (target.hp <= 0) {
          game.phase = 'gameover';
          game.winner = sourceActor || opponent(targetActor);
          log(game, actorName(game, game.winner) + '获胜！');
        }
        return true;
      }

      function findResponseCard(state, type) {
        var card = null;
        if (type === 'shan') {
          card = removeFirstCardOfType(state, 'shan');
          if (card) return { card: card, asName: '闪', skillName: null };
          if (hasSkill(state, 'longdan')) {
            card = removeFirstMatchingCard(state, function (item) { return isShaCard(item); });
            if (card) return { card: card, asName: '闪', skillName: '龙胆' };
          }
          return null;
        }
        if (type === 'sha') {
          card = removeFirstCardOfType(state, 'sha');
          if (card) return { card: card, asName: '杀', skillName: null };
          if (hasSkill(state, 'longdan')) {
            card = removeFirstCardOfType(state, 'shan');
            if (card) return { card: card, asName: '杀', skillName: '龙胆' };
          }
          if (hasSkill(state, 'wusheng')) {
            card = removeFirstMatchingCard(state, function (item) { return item.color === 'red'; });
            if (card) return { card: card, asName: '杀', skillName: '武圣' };
          }
          return null;
        }
        card = removeFirstCardOfType(state, type);
        return card ? { card: card, asName: card.name, skillName: null } : null;
      }

      function consumeResponse(game, actor, type, reason) {
        var response = findResponseCard(game[actor], type);
        if (!response) return false;
        if (type === 'sha' && actor === game.turn) game[actor].usedOrRespondedSha = true;
        discardCard(game, response.card);
        if (response.skillName) {
          log(game, actorName(game, actor) + '发动【' + response.skillName + '】，将【' + response.card.name + '】当【' + response.asName + '】响应' + reason + '。');
        } else {
          log(game, actorName(game, actor) + '打出【' + response.card.name + '】响应' + reason + '。');
        }
        return true;
      }

      function consumeWuxie(game, actor, reason) {
        var card = removeFirstCardOfType(game[actor], 'wuxie');
        if (!card) return false;
        discardCard(game, card);
        log(game, actorName(game, actor) + '打出【无懈可击】抵消' + reason + '。');
        triggerJizhi(game, actor, card, { response: true });
        return true;
      }

      function judge(game, actor, reason) {
        reshuffleIfNeeded(game);
        var card = game.deck.pop();
        if (!card) return null;
        discardCard(game, card);
        log(game, actorName(game, actor) + '进行' + reason + '判定：【' + card.name + '】' + card.suit + ' ' + card.rank + '。');
        return card;
      }

      function judgementReasonFor(trick) {
        if (!trick) return null;
        if (trick.type === 'lebusishu') return '【乐不思蜀】';
        if (trick.type === 'bingliang') return '【兵粮寸断】';
        if (trick.type === 'shandian') return '【闪电】';
        return null;
      }

      function processJudgeArea(game, actor) {
        var state = game[actor];
        state.flags = state.flags || {};
        state.flags.skipPlay = false;
        state.flags.skipDraw = false;
        if (!state.judgeArea) state.judgeArea = [];
        var pending = state.judgeArea.splice(0);
        pending.forEach(function (trick) {
          var reason = judgementReasonFor(trick);
          var judgementCard = reason ? judge(game, actor, reason) : null;
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
            damage(game, actor, outcome.damage, opponent(actor), '【闪电】');
          } else if (trick.type === 'shandian' && outcome.moveToNext) {
            game[opponent(actor)].judgeArea.push(trick);
            log(game, '【闪电】移至' + actorName(game, opponent(actor)) + '的判定区。');
          }
          if (outcome.discardTrick) discardCard(game, trick);
        });
      }

      function newGame(options) {
        options = options || {};
        var random = makeRng(options.seed || Date.now());
        var roles = {
          player: options.playerRole || '主公',
          enemy: options.enemyRole || '反贼'
        };
        var firstActor = options.firstActor || firstActorFromRoles(roles, 'player');
        var game = {
          version: '3.0.0',
          random: random,
          nextId: 0,
          turn: firstActor,
          phase: 'play',
          winner: null,
          deck: [],
          discard: [],
          log: [],
          turnHistory: [],
          roles: roles,
          firstActor: firstActor,
          player: makePlayer(clone(HERO_CATALOG[options.playerHero] || HEROES.player)),
          enemy: makePlayer(clone(HERO_CATALOG[options.enemyHero] || HEROES.enemy))
        };
        game.deck = buildDeck(game, random);
        drawCards(game, 'player', 4);
        drawCards(game, 'enemy', 4);
        log(game, '乱世开局：' + actorName(game, firstActor) + '为主公先手。');
        if (options.startWithFirstTurn) startTurn(game, firstActor);
        return game;
      }

      function equipmentSlots() {
        return ['weapon', 'armor', 'horseMinus', 'horsePlus'];
      }

      function equipmentSlotLabel(slot) {
        var labels = { weapon: '武器', armor: '防具', horseMinus: '-1 马', horsePlus: '+1 马' };
        return labels[slot] || '装备';
      }

      function equipmentList(state) {
        return equipmentSlots().map(function (slot) {
          return state.equipment && state.equipment[slot] ? { slot: slot, card: state.equipment[slot] } : null;
        }).filter(Boolean);
      }

      function hasAnyTargetableCard(state) {
        return !!(state && ((state.hand && state.hand.length) || (state.judgeArea && state.judgeArea.length) || equipmentList(state).length));
      }

      function defaultTargetZone(state) {
        if (state.hand && state.hand.length) return 'hand';
        if (equipmentList(state).length) return 'equipment';
        if (state.judgeArea && state.judgeArea.length) return 'judge';
        return 'hand';
      }

      function getTargetZoneCards(game, targetActor, zone) {
        var target = game && game[targetActor];
        if (!target) return [];
        zone = zone || defaultTargetZone(target);
        if (zone === 'hand') {
          return target.hand.map(function (card, index) {
            return { zone: 'hand', zoneLabel: '手牌区', index: index, card: card, label: '手牌 ' + (index + 1), hidden: true };
          });
        }
        if (zone === 'equipment') {
          return equipmentList(target).map(function (entry) {
            return { zone: 'equipment', zoneLabel: '装备区', slot: entry.slot, card: entry.card, label: equipmentSlotLabel(entry.slot) + '【' + entry.card.name + '】' };
          });
        }
        if (zone === 'judge') {
          return target.judgeArea.map(function (card, index) {
            return { zone: 'judge', zoneLabel: '延时锦囊区', index: index, card: card, label: '判定 ' + (index + 1) + '【' + card.name + '】' };
          });
        }
        return [];
      }

      function removeTargetZoneCard(game, targetActor, zone, cardId) {
        var target = game[targetActor];
        zone = zone || defaultTargetZone(target);
        var choices = getTargetZoneCards(game, targetActor, zone);
        if (!choices.length) return null;
        var picked;
        if (cardId) {
          picked = choices.find(function (entry) { return entry.card.id === cardId; });
          if (!picked) return null;
        } else if (zone === 'hand') {
          picked = choices[randomHandIndex(game, target)];
        } else {
          picked = choices[0];
        }
        if (!picked || !picked.card) return null;
        if (zone === 'hand') {
          return { card: target.hand.splice(picked.index, 1)[0], zone: '手牌' };
        }
        if (zone === 'equipment') {
          target.equipment[picked.slot] = null;
          return { card: picked.card, zone: '装备区' };
        }
        if (zone === 'judge') {
          return { card: target.judgeArea.splice(picked.index, 1)[0], zone: '判定区' };
        }
        return null;
      }

      function canPlayCard(game, actor, card) {
        if (!card) return fail('找不到这张牌。');
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        if (game.turn !== actor) return fail('还没有轮到你行动。');
        if (game.phase !== 'play') return fail('当前不是出牌阶段。');
        var self = game[actor];
        if (card.type === 'shan' || card.type === 'wuxie') return fail('【' + card.name + '】只能用于响应，本版会自动打出。');
        if (isKongchengProtected(game, opponent(actor), card.type)) return fail(actorName(game, opponent(actor)) + '处于【空城】状态，不能成为【' + card.name + '】目标。');
        if (isShaCard(card) && !canReachWithSha(game, actor, opponent(actor))) return fail('距离不足，当前武器范围无法使用【杀】。');
        if (isShaCard(card) && self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
        if (card.type === 'tao' && self.hp >= self.maxHp) return fail('体力已满，不能使用【桃】。');
        if ((card.type === 'guohe' || card.type === 'shunshou') && !hasAnyTargetableCard(game[opponent(actor)])) {
          return fail('对方没有可操作的牌。');
        }
        return success('可以使用。');
      }

      function playSha(game, actor, card) {
        var self = game[actor];
        var targetActor = opponent(actor);
        var target = game[targetActor];
        if (isKongchengProtected(game, targetActor, card.type)) return fail(actorName(game, targetActor) + '处于【空城】状态，不能成为【杀】目标。');
        if (!canReachWithSha(game, actor, targetActor)) return fail('距离不足，当前武器范围无法使用【杀】。');
        self.usedSha = true;
        self.usedOrRespondedSha = true;
        var amount = 1 + (self.shaBonus || 0);
        self.shaBonus = 0;
        var weapon = self.equipment && self.equipment.weapon;
        var armor = target.equipment && target.equipment.armor;
        var ignoreArmor = isArmorIgnoredBySha(game, actor, card);
        log(game, actorName(game, actor) + '对' + actorName(game, targetActor) + '使用【' + card.name + '】。');

        if (armor && !ignoreArmor && armor.type === 'renwang' && card.color === 'black') {
          log(game, actorName(game, targetActor) + '的【仁王盾】抵消了黑色【杀】。');
          discardCard(game, card);
          return success('仁王盾抵消。');
        }

        var dodged = false;
        var tieqiLocked = false;
        if (hasSkill(self, 'tieqi')) {
          var tieqiJudge = judge(game, targetActor, '【铁骑】');
          if (tieqiJudge && tieqiJudge.color === 'red') {
            tieqiLocked = true;
            log(game, actorName(game, actor) + '发动【铁骑】，红色判定令' + actorName(game, targetActor) + '不能打出【闪】。');
          } else {
            log(game, actorName(game, actor) + '发动【铁骑】，判定未命中。');
          }
        }
        if (!tieqiLocked && consumeResponse(game, targetActor, 'shan', '【杀】')) {
          dodged = true;
        } else if (!tieqiLocked && armor && !ignoreArmor && armor.type === 'bagua') {
          var baguaJudge = judge(game, targetActor, '【八卦阵】');
          if (baguaJudge && baguaJudge.color === 'red') {
            log(game, actorName(game, targetActor) + '的【八卦阵】判定为红色，视为打出【闪】。');
            dodged = true;
          }
        }

        if (dodged) {
          if (weapon && weapon.type === 'guanshi' && self.hand.length >= 2) {
            var costA = self.hand.shift();
            var costB = self.hand.shift();
            discardCard(game, costA);
            discardCard(game, costB);
            log(game, actorName(game, actor) + '发动【贯石斧】，弃置两张牌令【杀】强制命中。');
            if (damage(game, targetActor, amount, actor, '【' + card.name + '】', card)) applyWeaponHitEffects(game, actor, targetActor);
            return success('贯石斧强制命中。');
          }
          if (weapon && weapon.type === 'qinglong') {
            var follow = removeFirstCardOfType(self, 'sha');
            if (follow) {
              log(game, actorName(game, actor) + '发动【青龙偃月刀】，继续使用一张【杀】。');
              discardCard(game, card);
              return playSha(game, actor, follow);
            }
          }
          log(game, actorName(game, targetActor) + '闪避成功，没有受到伤害。');
          discardCard(game, card);
          return success('目标闪避。');
        }

        if (damage(game, targetActor, amount, actor, '【' + card.name + '】', card)) applyWeaponHitEffects(game, actor, targetActor);
        return success(target.name + '受到攻击。');
      }

      function playDuel(game, actor, card) {
        var current = opponent(actor);
        discardCard(game, card);
        log(game, actorName(game, actor) + '发起【决斗】。');
        while (game.phase !== 'gameover') {
          if (consumeResponse(game, current, 'sha', '【决斗】')) {
            current = opponent(current);
          } else {
            damage(game, current, 1, opponent(current), '【决斗】');
            break;
          }
        }
        return success('决斗结算完成。');
      }

      function playAOE(game, actor, card, responseType, title) {
        var targetActor = opponent(actor);
        discardCard(game, card);
        log(game, actorName(game, actor) + '使用【' + title + '】。');
        if (consumeResponse(game, targetActor, responseType, '【' + title + '】')) {
          log(game, actorName(game, targetActor) + '成功化解【' + title + '】。');
        } else {
          damage(game, targetActor, 1, actor, '【' + title + '】');
        }
        return success(title + '结算完成。');
      }

      function getHuogongChoice(game, actor) {
        var self = game && game[actor];
        var target = game && game[opponent(actor)];
        if (!self || !target || !target.hand || !target.hand.length) {
          return { ok: false, revealedCard: null, usableCostIds: [], unusableCostIds: [], usableCards: [], unusableCards: [], message: '目标没有手牌。' };
        }
        var revealed = target.hand[0];
        var usableCards = [];
        var unusableCards = [];
        self.hand.forEach(function (card) {
          if (card.type === 'huogong') return;
          if (card.suit === revealed.suit) usableCards.push(card);
          else unusableCards.push(card);
        });
        return {
          ok: true,
          revealedCard: revealed,
          revealedSuit: revealed.suit,
          usableCards: usableCards,
          unusableCards: unusableCards,
          usableCostIds: usableCards.map(function (card) { return card.id; }),
          unusableCostIds: unusableCards.map(function (card) { return card.id; })
        };
      }

      function playCard(game, actor, cardId, options) {
        var self = game[actor];
        options = options || {};
        if (!self) return fail('未知角色。');
        var card = self.hand.find(function (item) { return item.id === cardId; });
        var playable = canPlayCard(game, actor, card);
        if (!playable.ok) return playable;
        if (card && (card.type === 'guohe' || card.type === 'shunshou') && (options.targetZone || options.targetCardId)) {
          var requestedZone = options.targetZone || defaultTargetZone(game[opponent(actor)]);
          var targetChoices = getTargetZoneCards(game, opponent(actor), requestedZone);
          if (!targetChoices.length) return fail('目标区域没有可操作的牌。');
          if (options.targetCardId && !targetChoices.some(function (entry) { return entry.card.id === options.targetCardId; })) {
            return fail('指定的目标牌不存在。');
          }
        }
        if (card && card.type === 'huogong' && options.huogongCostCardId) {
          var huogongChoice = getHuogongChoice(game, actor);
          if (!huogongChoice.ok) return fail(huogongChoice.message);
          if (huogongChoice.usableCostIds.indexOf(options.huogongCostCardId) < 0) return fail('请选择与展示牌同花色的手牌。');
        }
        card = removeCardFromHand(self, cardId);

        if (isShaCard(card)) return playSha(game, actor, card);

        if (card.family === 'equipment') return equipCard(game, actor, card);

        if (card.family === 'delayed') {
          if (card.type === 'shandian') {
            self.judgeArea.push(card);
            log(game, actorName(game, actor) + '将【闪电】置入自己的判定区。');
          } else {
            var delayedTarget = game[opponent(actor)];
            delayedTarget.judgeArea.push(card);
            log(game, actorName(game, actor) + '将【' + card.name + '】置入' + actorName(game, opponent(actor)) + '的判定区。');
          }
          return success('延时锦囊生效。');
        }

        if (card.type === 'tao') {
          discardCard(game, card);
          self.hp = Math.min(self.maxHp, self.hp + 1);
          log(game, actorName(game, actor) + '使用【桃】，回复 1 点体力。');
          return success('回复体力。');
        }

        if (card.type === 'jiu') {
          discardCard(game, card);
          self.shaBonus = (self.shaBonus || 0) + 1;
          log(game, actorName(game, actor) + '饮下【酒】，下一张【杀】伤害 +1。');
          return success('下一张杀伤害提升。');
        }

        if (card.type === 'wuzhong') {
          discardCard(game, card);
          log(game, actorName(game, actor) + '使用【无中生有】。');
          drawCards(game, actor, 2);
          return finishTrickUse(game, actor, card, success('摸两张牌。'), options);
        }

        if (card.type === 'juedou') {
          if (consumeWuxie(game, opponent(actor), '【决斗】')) {
            discardCard(game, card);
            return finishTrickUse(game, actor, card, success('决斗被无懈可击。'), options);
          }
          return finishTrickUse(game, actor, card, playDuel(game, actor, card), options);
        }
        if (card.type === 'nanman') return finishTrickUse(game, actor, card, playAOE(game, actor, card, 'sha', '南蛮入侵'), options);
        if (card.type === 'wanjian') return finishTrickUse(game, actor, card, playAOE(game, actor, card, 'shan', '万箭齐发'), options);

        if (card.type === 'guohe') {
          var target = game[opponent(actor)];
          discardCard(game, card);
          if (consumeWuxie(game, opponent(actor), '【过河拆桥】')) return finishTrickUse(game, actor, card, success('过河拆桥被无懈可击。'), options);
          var droppedInfo = removeTargetZoneCard(game, opponent(actor), options.targetZone, options.targetCardId);
          if (droppedInfo && droppedInfo.card) {
            discardCard(game, droppedInfo.card);
            log(game, actorName(game, actor) + '使用【过河拆桥】，弃置了' + actorName(game, opponent(actor)) + droppedInfo.zone + '的【' + droppedInfo.card.name + '】。');
          }
          return finishTrickUse(game, actor, card, success('弃置对方一张牌。'), options);
        }

        if (card.type === 'shunshou') {
          discardCard(game, card);
          if (consumeWuxie(game, opponent(actor), '【顺手牵羊】')) return finishTrickUse(game, actor, card, success('顺手牵羊被无懈可击。'), options);
          var stolenInfo = removeTargetZoneCard(game, opponent(actor), options.targetZone, options.targetCardId);
          if (stolenInfo && stolenInfo.card) {
            self.hand.push(stolenInfo.card);
            log(game, actorName(game, actor) + '使用【顺手牵羊】，获得了' + actorName(game, opponent(actor)) + stolenInfo.zone + '的一张牌。');
          }
          return finishTrickUse(game, actor, card, success('获得对方一张牌。'), options);
        }

        if (card.type === 'taoyuan') {
          discardCard(game, card);
          ['player', 'enemy'].forEach(function (side) {
            game[side].hp = Math.min(game[side].maxHp, game[side].hp + 1);
          });
          log(game, actorName(game, actor) + '使用【桃园结义】，所有角色回复 1 点体力。');
          return finishTrickUse(game, actor, card, success('桃园结义结算完成。'), options);
        }

        if (card.type === 'wugu') {
          discardCard(game, card);
          [actor, opponent(actor)].forEach(function (side) {
            reshuffleIfNeeded(game);
            if (game.deck.length) {
              var gained = game.deck.pop();
              game[side].hand.push(gained);
              log(game, actorName(game, side) + '从【五谷丰登】获得【' + gained.name + '】。');
            }
          });
          return finishTrickUse(game, actor, card, success('五谷丰登结算完成。'), options);
        }

        if (card.type === 'huogong') {
          var fireTarget = game[opponent(actor)];
          discardCard(game, card);
          if (consumeWuxie(game, opponent(actor), '【火攻】')) return finishTrickUse(game, actor, card, success('火攻被无懈可击。'), options);
          if (!fireTarget.hand.length) return finishTrickUse(game, actor, card, success('目标没有手牌，火攻未造成伤害。'), options);
          var revealed = fireTarget.hand[0];
          log(game, actorName(game, opponent(actor)) + '展示【' + revealed.name + '】（' + revealed.suit + '）。');
          if (options.declineHuogong) {
            log(game, actorName(game, actor) + '选择不弃置同花色牌，【火攻】未造成伤害。');
            return finishTrickUse(game, actor, card, success('火攻未追加弃牌。'), options);
          }
          var cost = options.huogongCostCardId ? removeCardFromHand(self, options.huogongCostCardId) : removeFirstMatchingCard(self, function (item) { return item.suit === revealed.suit; });
          if (!cost) return finishTrickUse(game, actor, card, success('没有同花色牌可弃，火攻未造成伤害。'), options);
          if (cost.suit !== revealed.suit) {
            self.hand.push(cost);
            return fail('请选择与展示牌同花色的手牌。');
          }
          discardCard(game, cost);
          log(game, actorName(game, actor) + '弃置同花色【' + cost.name + '】发动【火攻】。');
          damage(game, opponent(actor), 1, actor, '【火攻】', null, 'fire');
          return finishTrickUse(game, actor, card, success('火攻结算完成。'), options);
        }

        if (card.type === 'tiesuo') {
          discardCard(game, card);
          if (options.mode === 'recast') {
            log(game, actorName(game, actor) + '重铸【铁索连环】，摸一张牌。');
            drawCards(game, actor, 1);
            return success('铁索连环重铸完成。');
          }
          var targets = Array.from(options.targets || [opponent(actor)]).filter(function (side, index, array) {
            return (side === 'player' || side === 'enemy') && array.indexOf(side) === index;
          }).slice(0, 2);
          if (!targets.length) return fail('请选择要横置或重置的角色。');
          targets.forEach(function (side) {
            game[side].chained = !game[side].chained;
            log(game, actorName(game, actor) + '使用【铁索连环】，' + actorName(game, side) + (game[side].chained ? '横置。' : '重置。'));
          });
          return finishTrickUse(game, actor, card, success('铁索连环结算完成。'), options);
        }

        if (card.type === 'jiedao') {
          var weaponOwner = game[opponent(actor)];
          discardCard(game, card);
          if (consumeWuxie(game, opponent(actor), '【借刀杀人】')) return finishTrickUse(game, actor, card, success('借刀杀人被无懈可击。'), options);
          if (!weaponOwner.equipment.weapon) return finishTrickUse(game, actor, card, success('目标没有武器，借刀杀人无效果。'), options);
          var borrowedSha = removeFirstCardOfType(weaponOwner, 'sha');
          if (borrowedSha) {
            log(game, actorName(game, opponent(actor)) + '被【借刀杀人】驱使使用【杀】。');
            return finishTrickUse(game, actor, card, playSha(game, opponent(actor), borrowedSha), options);
          }
          var borrowedWeapon = weaponOwner.equipment.weapon;
          weaponOwner.equipment.weapon = null;
          self.hand.push(borrowedWeapon);
          log(game, actorName(game, actor) + '因【借刀杀人】获得【' + borrowedWeapon.name + '】，置入手牌。');
          return finishTrickUse(game, actor, card, success('借刀杀人获得武器。'), options);
        }

        discardCard(game, card);
        return success('卡牌已使用。');
      }

      function startTurn(game, actor) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        if (!game[actor]) return fail('未知角色。');
        game.turn = actor;
        var state = game[actor];
        resetActorTurnState(state);

        setPhase(game, actor, 'prepare');
        log(game, actorName(game, actor) + '的准备阶段。');

        setPhase(game, actor, 'judge');
        log(game, actorName(game, actor) + '的判定阶段。');
        processJudgeArea(game, actor);
        if (game.phase === 'gameover') return success('游戏结束。');

        setPhase(game, actor, 'draw');
        log(game, actorName(game, actor) + '的摸牌阶段。');
        if (!state.flags.skipDraw) {
          performDrawPhase(game, actor);
        } else {
          log(game, actorName(game, actor) + '跳过摸牌阶段。');
        }

        setPhase(game, actor, nextPlayablePhase(state));
        log(game, actorName(game, actor) + '进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
        return success('回合开始。');
      }

      function finishPlayPhase(game) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        var actor = game.turn;
        var state = game[actor];
        if (state && hasSkill(state, 'keji') && !state.usedOrRespondedSha) {
          setPhase(game, actor, 'finish');
          log(game, actorName(game, actor) + '发动【克己】，本回合未使用或打出【杀】，跳过弃牌阶段。');
          return success('克己跳过弃牌阶段。');
        }
        setPhase(game, actor, 'discard');
        log(game, actorName(game, actor) + '结束出牌，进入弃牌阶段。');
        return success('进入弃牌阶段。');
      }

      function discardExcess(game, actor, cardIds) {
        var state = game[actor];
        if (!state) return fail('未知角色。');
        cardIds = cardIds || [];
        var excess = Math.max(0, state.hand.length - handLimit(game, actor));
        if (excess === 0) return success('无需弃牌。');
        if (cardIds.length < excess) return fail('需要弃置 ' + excess + ' 张牌。');
        var discarded = [];
        for (var i = 0; i < cardIds.length && discarded.length < excess; i += 1) {
          var card = removeCardFromHand(state, cardIds[i]);
          if (card) {
            discarded.push(card);
            discardCard(game, card);
          }
        }
        if (state.hand.length > handLimit(game, actor)) return fail('弃牌数量不足。');
        log(game, actorName(game, actor) + '弃置 ' + discarded.length + ' 张牌，满足手牌上限。');
        return success('弃牌完成。');
      }

      function getDiscardCount(game, actor) {
        var state = game[actor];
        if (!state) return 0;
        return Math.max(0, state.hand.length - handLimit(game, actor));
      }

      function needsDiscard(game, actor) {
        return getDiscardCount(game, actor) > 0;
      }

      function discardSelected(game, actor, cardIds) {
        var state = game[actor];
        if (!state) return fail('未知角色。');
        cardIds = Array.from(cardIds || []);
        var needed = getDiscardCount(game, actor);
        if (needed === 0) return success('无需弃牌。');
        if (cardIds.length < needed) return fail('需要弃置 ' + needed + ' 张牌。');

        var unique = [];
        cardIds.forEach(function (id) {
          if (unique.indexOf(id) < 0) unique.push(id);
        });
        var valid = unique.filter(function (id) {
          return state.hand.some(function (card) { return card.id === id; });
        });
        if (valid.length < needed) return fail('请选择 ' + needed + ' 张有效手牌弃置。');

        var discarded = [];
        for (var i = 0; i < valid.length && discarded.length < needed; i += 1) {
          var card = removeCardFromHand(state, valid[i]);
          if (card) {
            discarded.push(card);
            discardCard(game, card);
          }
        }
        log(game, actorName(game, actor) + '弃置 ' + discarded.length + ' 张牌，满足手牌上限。');
        return success('弃牌完成。');
      }

      function advancePhase(game) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        var actor = game.turn;
        if (game.phase === 'prepare') {
          setPhase(game, actor, 'judge');
          log(game, actorName(game, actor) + '的判定阶段。');
          processJudgeArea(game, actor);
          return success('进入判定阶段。');
        }
        if (game.phase === 'judge') {
          setPhase(game, actor, 'draw');
          log(game, actorName(game, actor) + '的摸牌阶段。');
          if (!game[actor].flags.skipDraw) performDrawPhase(game, actor);
          return success('进入摸牌阶段。');
        }
        if (game.phase === 'draw') {
          setPhase(game, actor, nextPlayablePhase(game[actor]));
          log(game, actorName(game, actor) + '进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
          return success('进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
        }
        if (game.phase === 'play') return finishPlayPhase(game);
        if (game.phase === 'discard') {
          if (needsDiscard(game, actor)) return fail('需要先弃置 ' + getDiscardCount(game, actor) + ' 张牌。');
          setPhase(game, actor, 'finish');
          log(game, actorName(game, actor) + '进入结束阶段。');
          return success('进入结束阶段。');
        }
        if (game.phase === 'finish') {
          return completeTurn(game, actor);
        }
        return fail('未知阶段。');
      }

      function triggerBiyue(game, actor) {
        var state = game[actor];
        if (!state || !hasSkill(state, 'biyue') || game.phase === 'gameover') return;
        state.flags = state.flags || {};
        if (state.flags.biyueTriggered) return;
        state.flags.biyueTriggered = true;
        log(game, actorName(game, actor) + '发动【闭月】，结束阶段摸 1 张牌。');
        drawCards(game, actor, 1);
      }

      function completeTurn(game, ending) {
        triggerBiyue(game, ending);
        resetEndOfTurnState(game[ending]);
        log(game, actorName(game, ending) + '结束回合。');
        return startTurn(game, opponent(ending));
      }

      function endTurn(game) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        var ending = game.turn;
        return completeTurn(game, ending);
      }

      function playZhangbaSha(game, actor, cardIds) {
        var self = game[actor];
        cardIds = cardIds || [];
        if (!self) return fail('未知角色。');
        if (!self.equipment || !self.equipment.weapon || self.equipment.weapon.type !== 'zhangba') return fail('未装备【丈八蛇矛】。');
        if (self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
        if (cardIds.length !== 2) return fail('需要选择两张手牌。');
        var first = removeCardFromHand(self, cardIds[0]);
        var second = removeCardFromHand(self, cardIds[1]);
        if (!first || !second) {
          if (first) self.hand.push(first);
          if (second) self.hand.push(second);
          return fail('选择的手牌不存在。');
        }
        discardCard(game, first);
        discardCard(game, second);
        var virtualSha = makeTestCard('sha', {
          id: 'zhangba-' + first.id + '-' + second.id,
          suit: first.suit,
          rank: first.rank,
          color: first.color,
          name: '丈八蛇矛杀'
        });
        log(game, actorName(game, actor) + '发动【丈八蛇矛】，将两张手牌当【杀】使用。');
        return playSha(game, actor, virtualSha);
      }

      function virtualShaFromCard(original) {
        return makeTestCard('sha', {
          id: original.id,
          suit: original.suit,
          rank: original.rank,
          color: original.color,
          name: original.name + '（当杀）',
          physicalCard: original
        });
      }

      function canPlayCardAs(game, actor, cardOrId, asType) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        var original = typeof cardOrId === 'string' ? self.hand.find(function (item) { return item.id === cardOrId; }) : cardOrId;
        if (!original) return fail('找不到这张牌。');
        if (asType !== 'sha') return fail('当前只支持转化为【杀】。');
        var skillName = null;
        if (hasSkill(self, 'wusheng') && original.color === 'red') skillName = '武圣';
        if (hasSkill(self, 'longdan') && original.type === 'shan') skillName = '龙胆';
        if (!skillName) return fail('当前武将不能这样转化。');
        if (self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
        var playable = canPlayCard(game, actor, virtualShaFromCard(original));
        if (!playable.ok) return playable;
        playable.skillName = skillName;
        playable.message = '发动【' + skillName + '】，将【' + original.name + '】当【杀】使用。';
        return playable;
      }

      function playCardAs(game, actor, cardId, asType) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        var original = self.hand.find(function (item) { return item.id === cardId; });
        var playable = canPlayCardAs(game, actor, original, asType);
        if (!playable.ok) return playable;
        removeCardFromHand(self, cardId);
        log(game, actorName(game, actor) + playable.message);
        return playSha(game, actor, virtualShaFromCard(original));
      }

      function getGuanxingPreview(game, actor) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        if (!hasSkill(self, 'guanxing')) return fail('没有【观星】。');
        var count = Math.min(5, game.deck.length);
        var preview = success('观星预览完成。');
        preview.cards = game.deck.slice(game.deck.length - count);
        return preview;
      }

      function useSkill(game, actor, skillId, cardIds, options) {
        var self = game[actor];
        cardIds = cardIds || [];
        options = options || {};
        if (!self) return fail('未知角色。');
        if (!hasSkill(self, skillId)) return fail('没有这个技能。');
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        if (game.turn !== actor) return fail('还没有轮到你行动。');
        if ((skillId === 'zhiheng' || skillId === 'kurou' || skillId === 'rende' || skillId === 'fanjian') && game.phase !== 'play') return fail('主动技能只能在出牌阶段发动。');
        self.flags = self.flags || {};
        if (skillId === 'zhiheng') {
          if (self.flags.zhihengUsed) return fail('【制衡】每回合限一次。');
          if (!cardIds.length) return fail('请选择要弃置的牌。');
          var discarded = [];
          for (var i = 0; i < cardIds.length; i += 1) {
            var card = removeCardFromHand(self, cardIds[i]);
            if (card) {
              discarded.push(card);
              discardCard(game, card);
            }
          }
          if (!discarded.length) return fail('没有成功弃置任何牌。');
          self.flags.zhihengUsed = true;
          log(game, actorName(game, actor) + '发动【制衡】，弃置 ' + discarded.length + ' 张牌并摸等量牌。');
          drawCards(game, actor, discarded.length);
          return success('制衡完成。');
        }
        if (skillId === 'kurou') {
          if (self.hp <= 1) return fail('体力不足，不能发动【苦肉】。');
          self.hp -= 1;
          log(game, actorName(game, actor) + '发动【苦肉】，失去 1 点体力并摸两张牌。');
          drawCards(game, actor, 2);
          return success('苦肉完成。');
        }
        if (skillId === 'rende') {
          if (!cardIds.length) return fail('请选择要给出的牌。');
          var given = [];
          cardIds.forEach(function (id) {
            var giveCard = removeCardFromHand(self, id);
            if (giveCard) {
              given.push(giveCard);
              game[opponent(actor)].hand.push(giveCard);
            }
          });
          if (!given.length) return fail('没有成功给出任何牌。');
          self.flags.rendeGiven = (self.flags.rendeGiven || 0) + given.length;
          log(game, actorName(game, actor) + '发动【仁德】，交给' + actorName(game, opponent(actor)) + ' ' + given.length + ' 张牌。');
          if (self.flags.rendeGiven >= 2 && !self.flags.rendeHealed && self.hp < self.maxHp) {
            self.hp = Math.min(self.maxHp, self.hp + 1);
            self.flags.rendeHealed = true;
            log(game, actorName(game, actor) + '因【仁德】回复 1 点体力。');
          }
          return success('仁德完成。');
        }
        if (skillId === 'fanjian') {
          if (self.flags.fanjianUsed) return fail('【反间】每回合限一次。');
          if (!cardIds.length) return fail('请选择一张交给对方的牌。');
          var fanjianCard = removeCardFromHand(self, cardIds[0]);
          if (!fanjianCard) return fail('选择的牌不存在。');
          game[opponent(actor)].hand.push(fanjianCard);
          self.flags.fanjianUsed = true;
          var guessedSuit = options.guessedSuit || 'spade';
          log(game, actorName(game, actor) + '发动【反间】，' + actorName(game, opponent(actor)) + '获得一张牌并猜测' + guessedSuit + '。');
          if (guessedSuit !== fanjianCard.suit) damage(game, opponent(actor), 1, actor, '【反间】', null, 'normal');
          return success('反间完成。');
        }
        if (skillId === 'guanxing') {
          if (self.flags.guanxingUsed) return fail('【观星】每回合限一次。');
          var preview = getGuanxingPreview(game, actor);
          if (!preview.ok) return preview;
          var count = preview.cards.length;
          var visibleCards = preview.cards.slice();
          var top = preview.cards.slice();
          if (options.orderIds && options.orderIds.length) {
            var chosen = [];
            options.orderIds.forEach(function (id) {
              var index = top.findIndex(function (card) { return card.id === id; });
              if (index >= 0) chosen.push(top.splice(index, 1)[0]);
            });
            game.deck.splice(game.deck.length - count, count);
            game.deck = game.deck.concat(top).concat(chosen);
          }
          log(game, actorName(game, actor) + '发动【观星】，观看牌堆顶 ' + count + ' 张牌。');
          self.flags.guanxingUsed = true;
          var guanxingResult = success('观星完成。');
          guanxingResult.cards = visibleCards;
          return guanxingResult;
        }
        return fail('这个技能的主动效果尚未实现。');
      }

      function scoreCardForAI(game, actor, card) {
        var self = game[actor];
        var target = game[opponent(actor)];
        if (card.type === 'tao') return self.hp < self.maxHp ? 100 : -100;
        if (card.type === 'wuzhong') return 90;
        if (card.type === 'jiu') return (!self.usedSha && self.hand.some(function (c) { return isShaType(c.type); })) ? 82 : -10;
        if (isShaType(card.type)) return (self.usedSha && !canUseUnlimitedSha(self)) ? -100 : (target.hand.some(function (c) { return c.type === 'shan'; }) ? 45 : 78);
        if (card.type === 'juedou') return self.hand.filter(function (c) { return isShaType(c.type); }).length >= target.hand.filter(function (c) { return isShaType(c.type); }).length ? 70 : 15;
        if (card.type === 'nanman') return target.hand.some(function (c) { return isShaType(c.type); }) ? 35 : 72;
        if (card.type === 'wanjian') return target.hand.some(function (c) { return c.type === 'shan'; }) ? 35 : 72;
        if (card.type === 'guohe') return target.hand.length ? 62 : -100;
        if (card.type === 'shunshou') return target.hand.length ? 66 : -100;
        if (card.family === 'equipment') return 50;
        if (card.family === 'delayed') return 48;
        return 0;
      }

      function aiChooseCard(game, actor) {
        if (game.turn !== actor || game.phase === 'gameover') return null;
        var candidates = game[actor].hand
          .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
          .filter(function (item) { return item.score > 0 && canPlayCard(game, actor, item.card).ok; })
          .sort(function (a, b) { return b.score - a.score; });
        return candidates.length ? candidates[0].card : null;
      }

      function aiChooseSkillAction(game, actor) {
        if (!game || game.turn !== actor || game.phase !== 'play') return null;
        var self = game[actor];
        if (!self) return null;
        self.flags = self.flags || {};

        if (hasSkill(self, 'kurou') && !self.flags.aiKurouUsed && self.hp > 1) {
          var hasPlayable = !!aiChooseCard(game, actor);
          if (!hasPlayable || self.hand.length <= 1) return { skillId: 'kurou', cardIds: [] };
        }

        if (hasSkill(self, 'zhiheng') && !self.flags.zhihengUsed && self.hand.length > 0 && game.deck.length > 0) {
          var candidates = self.hand
            .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
            .filter(function (item) { return item.score <= 0 || !canPlayCard(game, actor, item.card).ok; })
            .sort(function (a, b) { return a.score - b.score; });
          if (!candidates.length && self.hand.length > handLimit(game, actor)) {
            candidates = self.hand.map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
              .sort(function (a, b) { return a.score - b.score; });
          }
          if (candidates.length) return { skillId: 'zhiheng', cardIds: [candidates[0].card.id] };
        }

        return null;
      }

      function aiTakeAction(game, actor) {
        if (!game || game.turn !== actor || game.phase !== 'play') {
          var blocked = success('当前不是出牌阶段。');
          blocked.action = 'none';
          return blocked;
        }

        var skillAction = aiChooseSkillAction(game, actor);
        if (skillAction) {
          var skillResult = useSkill(game, actor, skillAction.skillId, skillAction.cardIds);
          if (skillResult.ok && skillAction.skillId === 'kurou') game[actor].flags.aiKurouUsed = true;
          skillResult.action = skillAction.skillId;
          return skillResult;
        }

        var card = aiChooseCard(game, actor);
        if (!card) {
          var idle = success('没有可执行的行动。');
          idle.action = 'none';
          return idle;
        }
        var cardOptions;
        if (card.type === 'tiesuo') cardOptions = { mode: 'chain', targets: [opponent(actor)] };
        if (card.type === 'huogong') {
          var fireChoice = getHuogongChoice(game, actor);
          cardOptions = fireChoice.ok && fireChoice.usableCostIds.length ? { huogongCostCardId: fireChoice.usableCostIds[0] } : { declineHuogong: true };
        }
        var cardResult = playCard(game, actor, card.id, cardOptions);
        cardResult.action = 'card';
        cardResult.cardId = card.id;
        return cardResult;
      }

      function aiDiscardCandidates(game, actor) {
        var state = game[actor];
        var count = getDiscardCount(game, actor);
        if (!state || count <= 0) return [];
        return state.hand
          .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
          .sort(function (a, b) { return a.score - b.score; })
          .slice(0, count)
          .map(function (item) { return item.card.id; });
      }

      function runAITurn(game, actor, maxActions) {
        if (!game || !game[actor]) return fail('未知角色。');
        maxActions = maxActions || 12;
        if (game.phase === 'gameover') return fail('游戏已经结束。');

        if (game.turn !== actor || ['prepare', 'judge', 'draw'].indexOf(game.phase) < 0) {
          var started = startTurn(game, actor);
          if (!started.ok || game.phase === 'gameover') return started;
        }

        if (game.phase === 'play') {
          for (var i = 0; i < maxActions; i += 1) {
            var action = aiTakeAction(game, actor);
            if (!action.ok) return action;
            if (action.action === 'none' || game.phase === 'gameover') break;
          }
          if (game.phase === 'play') finishPlayPhase(game);
        }

        if (game.phase === 'discard' && needsDiscard(game, actor)) {
          var discarded = discardSelected(game, actor, aiDiscardCandidates(game, actor));
          if (!discarded.ok) return discarded;
        }

        if (game.phase === 'discard') {
          var advanced = advancePhase(game);
          if (!advanced.ok) return advanced;
        }

        if (game.phase === 'finish') {
          var ended = endTurn(game);
          if (!ended.ok) return ended;
        }

        var done = success('AI 回合完成。');
        done.action = 'turn';
        return done;
      }

      window.SanguoshaEngine = {
        HEROES: HEROES,
        HERO_CATALOG: HERO_CATALOG,
        IMPLEMENTED_SKILL_IDS: IMPLEMENTED_SKILL_IDS.slice(),
        ACTIVE_SKILL_IDS: ACTIVE_SKILL_IDS.slice(),
        CARD_INFO: CARD_INFO,
        CARD_CATALOG: CARD_CATALOG,
        PHASES: PHASES,
        makeTestCard: makeTestCard,
        newGame: newGame,
        distanceBetween: distanceBetween,
        equipCard: equipCard,
        loseEquipment: loseEquipment,
        getTargetZoneCards: getTargetZoneCards,
        getHuogongChoice: getHuogongChoice,
        getGuanxingPreview: getGuanxingPreview,
        isShaCard: isShaCard,
        playZhangbaSha: playZhangbaSha,
        canPlayCard: canPlayCard,
        canPlayCardAs: canPlayCardAs,
        playCard: playCard,
        playCardAs: playCardAs,
        useSkill: useSkill,
        startTurn: startTurn,
        advancePhase: advancePhase,
        finishPlayPhase: finishPlayPhase,
        discardExcess: discardExcess,
        getDiscardCount: getDiscardCount,
        needsDiscard: needsDiscard,
        discardSelected: discardSelected,
        handLimit: handLimit,
        getActorStatus: getActorStatus,
        endTurn: endTurn,
        drawCards: drawCards,
        aiChooseCard: aiChooseCard,
        aiChooseSkillAction: aiChooseSkillAction,
        aiTakeAction: aiTakeAction,
        runAITurn: runAITurn,
        opponent: opponent
      };
    }());
