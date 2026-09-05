# ボス画像の生成プロンプト

画像は作らず、プロンプトだけを置く。生成は人がやる。

**特定の商品の絵柄を指定していない。** 「あの game の絵柄で」と書くと、実在の
意匠に寄せた出力を狙うことになる。ここでは狙いの絵柄を自分の言葉で書き下している。

## 1. 4体を通した絵柄の指定

**4体は同じ画面に並ぶ可能性がある。**（履歴、闘技場の記録、図鑑を作れば必ず並ぶ。）
バラバラの絵柄だと1つの遊びに見えないので、下の段落は4体すべてに同じものを付ける。

```
Style: cute chibi fantasy RPG monster, 2-head-tall deformed proportions, big
expressive eyes, thick clean outlines, flat cel shading with two shadow tones,
soft warm palette, hand-drawn storybook feel, front-facing three-quarter view,
full body, centered, standing on nothing.
Rendering: crisp vector-like edges, no gradient noise, no texture grain.
Background: fully transparent.
Framing: square canvas, subject occupies about 80% of the height, generous margin.
No text, no logo, no watermark, no signature, no border, no ground shadow.
```

**除外する指定（negative prompt）**

```
photorealistic, 3d render, realistic anatomy, gore, blood, horror, scary for
children, text, letters, watermark, signature, frame, border, multiple views,
turnaround sheet, extra limbs, cropped, cut off
```

### 大きさと形式

- **正方形、1024×1024、背景透過のPNG。** 画面側は幅に合わせて縮めるだけにする
- 4体とも**同じ余白**で書き出す。余白が違うと並べたとき大きさが揃わない
- 影を地面に描き込まない。背景が羊皮紙にも夜にも変わるため

## 2. 炎竜バルゴス（第1章のボス）

火の竜。炎に半分包まれ、氷に弱く炎に強い。行動は「火炎の息」「威嚇」「溜め」
「灼熱爆発」、追い詰めると「狂乱の爪」で暴れる。

**絵にしたい要点。** 溜めてから撃つ相手なので、**息を吸い込んでいる瞬間**がよい。
強大だが可愛げがあること。第1章の相手なので、恐ろしすぎない。

```
A chubby red dragon cub with oversized head and stubby wings, inhaling deeply
with cheeks puffed and a small ember glowing at the throat, molten orange
cracks along its back, tiny curved horns, thick tail curled forward, standing
on two legs, proud and slightly comical expression, warm red and amber palette
with ash-grey highlights.
```

## 3. 鬼呪術師ゴウザ（第2章のボス）

鬼の呪術師。爪で殴りつつ、「呪詠」で力を溜めてから「呪詠の波動」を放つ。
魔法で押してくる相手。

**絵にしたい要点。** 竜ではなく**人型の鬼**にして、シルエットでバルゴスと
区別がつくようにする。杖や札など、呪いを操る小道具を持たせる。紫と黒の呪い色。

```
A short stocky ogre shaman with blue-grey skin and one broken horn, wearing a
patched straw cloak hung with paper talismans, gripping a gnarled wooden staff
topped with a floating violet rune, mouth open mid-incantation, purple curse
wisps swirling around the free hand, small tusks, fierce but mischievous
expression, violet and charcoal palette with ochre cloth accents.
```

## 4. 深淵竜ヴォルニル（第3章のボス）

深淵の竜。「深淵の咆哮」でこちらの動きを止め、「尾の薙ぎ払い」で追撃する。
バルゴスより一回り大きく、暗い。

**絵にしたい要点。** バルゴスと**同じ竜だからこそ差を付ける**。色を炎の赤から
深い藍と黒へ、体型を丸みから細長さへ、翼を膜から裂けた影のようなものへ。
咆哮の瞬間を描くと、行動表の「咆哮」と結びつく。

```
A sleek dark dragon with deep indigo scales and torn shadow-like wings,
elongated neck raised in a roar, faint pale-blue light spilling from between
its scales and from the open mouth, long whip-like tail sweeping behind,
four slender horns swept back, chibi proportions but leaner and taller than a
cub, imposing and cold expression, indigo and black palette with pale cyan glow.
```

## 5. 深淵の覇王（闘技場20階・裏ボス）

塔の最上階。19階を倒すまで名前も出ない。「力を溜める」で隙を作り、
「終焉の波動」で場を薙ぎ払う。追い詰めると「憤怒の乱舞」。

**絵にしたい要点。** 4体で**最も格上に見えること**。ヴォルニルと系統は同じ
「深淵」だが、獣ではなく**王**にする。玉座、王冠、装束のような要素で
「支配している者」を出す。可愛さは残しつつ、目だけは笑っていない。

```
A regal armored figure of living shadow with a cracked golden crown floating
above its hollow head, tattered royal mantle dissolving into dark smoke at the
hem, two burning pale-violet eyes, gauntleted hands raised as dark energy
gathers between them, chibi proportions with a broad heavy silhouette, faint
constellation-like motes orbiting the mantle, black and deep violet palette
with antique gold trim.
```

## 6. 差し込み方（画像ができたあと）

まだ枠を作っていない。画像が揃ってから次を行う。

1. `apps/web/public/bosses/` に `balgos.png` `gouza.png` `vornil.png`
   `abyssalSovereign.png` として置く
2. 敵のIDから画像のパスを引く対応表を画面側に置く。**サーバは触らない。**
   敵のマスタは `packages/core` にあり、画像はあくまで見た目なので、
   核のデータに画像パスを持たせない
3. 対応する画像が無い敵は、**枠だけ出して名前を大きく見せる。**
   壊れた画像アイコンを出さない。雑魚敵と闘技場の敵には絵が無いままなので、
   「無いのが普通」の作りにしておく必要がある
