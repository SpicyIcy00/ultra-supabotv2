-- ===========================================================================
-- Warehouse Packing — Step 2b: seed pack_weight_g and nickname on products
--
-- 115 rows from product_matching_final.csv, with the corrections agreed during
-- reconciliation:
--   * KF26    -> 688f902ecc94ae0007e18168  (was pointing at SH1169 Aji Plum Okinawa)
--   * JUD0202 -> 681454f3cf78800007265bb3  (was pointing at Judya4 snow ball)
--   * AJI11   -> 66b5797002b6810007629ff5  (was pointing at SH1090 Codfish Sesame)
--   * "squid slices 90-120g" dropped — same product + SKU as "hokkaido squid 180g"
--   * "sugar ginger A13 130g" de-duplicated (listed twice, identical)
--   * "white rabbit original" gets a nickname but no weight (none in the sheet)
--
-- Re-runnable: it overwrites the same 115 rows with the same values.
-- Run statement 1, then the checks in statement 2.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Apply the weights and nicknames.
-- ---------------------------------------------------------------------------
UPDATE products p
SET pack_weight_g = v.pack_weight_g,
    nickname      = v.nickname
FROM (VALUES
    ('663c78b8391c7c000795d43c', 130::numeric, 'kiamoy strips 130g'),  -- Aji Kiamoy Strips
    ('663c78b7391c7c000795d3cc', 100::numeric, 'Curl sour 100g'),  -- Aji Kiamoy Curl Sour
    ('663c788e391c7c000795b342', 130::numeric, 'Summer 130g'),  -- Aji Kiamoy Summer
    ('663c78b4391c7c000795d1d4', 140::numeric, 'Dikiam 140g'),  -- Aji Dikiam Sweet Taiwan
    ('6666c82fc7a0920007c45a5b', 160::numeric, 'Honey bayberry 160g'),  -- aji champoy honey bayberry
    ('663c78b9391c7c000795d58c', 95::numeric, 'okinawa 95g'),  -- Aji Plum Okinawa
    ('67a47841d847c70007fdbaa7', 180::numeric, 'Cured plum 180g'),  -- Aji cured plum
    ('663c78b8391c7c000795d474', 90::numeric, 'Emperor plum 90g'),  -- Aji Emperor Plum
    ('663c78b3391c7c000795d092', 150::numeric, 'Champoy bayberry 150g'),  -- Aji Champoy Bayberry
    ('663c78b7391c7c000795d3e8', 40::numeric, 'King seedless 40g'),  -- Aji Kiamoy King Seedless
    ('663c78b9391c7c000795d562', 160::numeric, 'Lovers plum 160g'),  -- Aji Plum Lovers
    ('6666c62c8770ef00086da39f', 150::numeric, 'K-plum  150g'),  -- aji plum - k plum
    ('672d6d617db5ce000870ca89', 180::numeric, 'Winter strips 180g'),  -- aji plum winter strips
    ('672d6df707e6ee0007143001', 150::numeric, 'Winter Singapore 150g'),  -- aji plum winter singapore
    ('672d6e56d946c90008213fda', 130::numeric, 'Winter curl 130g'),  -- aji plum winter curl
    ('663c78ba391c7c000795d60a', 120::numeric, 'Cubes 120g'),  -- Aji Red Lovers Plum Cubes
    ('672d6caa929c8900074e0bac', 130::numeric, 'Crimson leaf 130g'),  -- aji plum crimson leaf
    ('672d6ec3c13f9400077a41d4', 70::numeric, 'Square cut  70g'),  -- aji plum square cut
    ('68303605c17c20000766d42f', 60::numeric, 'Mango tango S 60'),  -- Aji plum mango tango S
    ('68303638966a3100071fe53a', 50::numeric, 'Moon blossom  S 50g'),  -- Aji plum moon blossom S
    ('672d6d1a88eca500079cefe0', 200::numeric, 'Plum snow ball A4 200g'),  -- aji plum snow ball
    ('6666c80858db9b0007e76e31', 160::numeric, 'sugar bayberry 160g'),  -- aji champoy - sugar baby bayberry
    ('6666c7b6d8fbe90008112fc0', 150::numeric, 'tangerine bayberry 150'),  -- Aji Tangerine Bayberry
    ('6666c786c7a0920007c43ab1', 150::numeric, '-ice cream plum 150g'),  -- Aji Plum Ice Cream
    ('681454f3cf78800007265bb3', 160::numeric, 'snow flakes plum A2 160g'),  -- aji snowflake plum
    ('681455dbe4c2a300073fc94b', 130::numeric, 'Mizu plum A4 130g'),  -- aji mizu plum
    ('692011154405b80007ed3da2', 140::numeric, 'Dried peach plum red'),  -- Aji Dried Peach Plum
    ('692010d3cddf3800065965ce', 140::numeric, 'Dried green plum'),  -- Aji Green Plum
    ('681322f81b6b18000721b64e', 130::numeric, 'sugar ginger A13 130g'),  -- aji sugar ginger
    ('681323e09a9f7b000722adab', 130::numeric, 'baby hellboy A14 130g'),  -- aji baby hellboy
    ('688f902ecc94ae0007e18168', 70::numeric, 'sweet okinawa 70g'),  -- aji sweet plum
    ('688f9002566c850006de0bc1', 140::numeric, 'rose champoy waxberry 140g'),  -- aji rose champoy waxberry
    ('663c78b9391c7c000795d570', 160::numeric, 'red lovers seedless A15 160g'),  -- Aji Plum Lovers Seedless
    ('6813225acf78800007078c0e', 150::numeric, 'Orchard peaches A16 150g'),  -- aji orchard peaches
    ('6813228e8d24ef00071fe03d', 130::numeric, 'salty tangerine A17 130g'),  -- aji salty tangerine
    ('6814549aebce620007a505e0', 140::numeric, 'licorice tangerine peel A18 140g'),  -- aji licorice tangerine peel
    ('681321e6cf7880000707725d', 130::numeric, 'wakayama A19 130g'),  -- aji plum wakayama
    ('6666c7df58db9b0007e76817', 180::numeric, 'evermoist  180g'),  -- Aji Plum Evermoist
    ('663c78a2391c7c000795c33a', 160::numeric, 'oolong plum 160g'),  -- Taiwan Oolong Tea Plum 160G
    ('666c088d6e8eae000705bcd9', 180::numeric, 'pickled plum 180g'),  -- Pickled Plum
    ('67a1c865e154e00007ad9a59', 150::numeric, 'blueberry plum 150g'),  -- Aji Blueberry Plum
    ('663c78b6391c7c000795d378', 75::numeric, 'Haw square 75g'),  -- Aji Haw Square
    ('6666c65c8770ef00086dabff', 150::numeric, 'Ms peaches 150g'),  -- aji peach - Ms. peaches
    ('672d6dadf1bad900074a4623', 160::numeric, 'april apricot 160g'),  -- aji april apricot
    ('672d6dceb628eb0006066e95', 200::numeric, 'amber kumquat 200g'),  -- aji amber sun kumquat
    ('663c78b8391c7c000795d4e4', 170::numeric, 'olives 170g'),  -- aji olives
    ('663c7870391c7c0007959b59', 140::numeric, 'mango 140g'),  -- Chiao-E Irwin Mango Marshmallow Biscuit
    ('663c78b8391c7c000795d490', 130::numeric, 'langka 130g'),  -- Aji Langka
    ('663c7870391c7c0007959b67', 140::numeric, 'pineapple 140g'),  -- Chiao-E Pineapple Cake
    ('663c78b6391c7c000795d340', 120::numeric, 'Guyabano 120g'),  -- Aji Guyabano
    ('663c78b8391c7c000795d4f2', 140::numeric, 'Papaya 140g'),  -- Aji Papaya
    ('663c787b391c7c000795a3d4', 80::numeric, 'Coconut 80g'),  -- Nissin Coconut Sable
    ('663c78b6391c7c000795d2fa', 120::numeric, 'guava 120g'),  -- Aji Guava
    ('663c78b6391c7c000795d308', 120::numeric, 'guava spicy 120g'),  -- Aji Guava Spicy
    ('663c78b4391c7c000795d1c6', 150::numeric, 'dates 150g'),  -- Aji Dates Glazed
    ('6814769c722d0500071a7b5d', 70::numeric, 'red dates 70g'),  -- aji red dates
    ('663c78ba391c7c000795d634', 130::numeric, 'sampaloc 130g'),  -- dont sell Aji Sampaloc
    ('663c78ba391c7c000795d642', 130::numeric, 'sampaloc spicy 130g'),  -- dont sell Aji Sampaloc Spicy
    ('677cffdd5d878a000791efbb', 40::numeric, 'freeze dried strawberry 40g'),  -- Freeze dried strawberry crisps
    ('688f910db644f90007d99c0e', 60::numeric, 'freeze dried kiwi 60g'),  -- aji freeze dried kiwi
    ('6a55f7955b607c0007ed9f3a', 90::numeric, 'freeze dried okra 90g'),  -- Miao freeze dried Okra
    ('663c78b5391c7c000795d2a6', 150::numeric, 'prune ginger 150g'),  -- Aji Ginger Prune
    ('688f8f92bf20870007a2deb8', 90::numeric, 'ruby ginger 90g'),  -- aji ruby ginger
    ('663c78b5391c7c000795d298', 150::numeric, 'lemon ginger 150g'),  -- Aji Ginger Lemon
    ('663c78b7391c7c000795d3be', 140::numeric, 'red ginger 140g'),  -- Aji Hk Red Ginger
    ('66584c91bc21e40006e4a85d', 35::numeric, 'goji berry 35g'),  -- Aji Tibet Goji Berries
    ('68c9427da83e2400077ad76f', 150::numeric, 'lemon juice ginger 150g'),  -- Aji lemon juice ginger
    ('663c78b4391c7c000795d148', 175::numeric, 'condol  175g'),  -- DO NOT SEND Aji Condol old
    ('66f675f823846000075f9398', 120::numeric, 'guava red 120g'),  -- aji guava red
    ('66f6760fdec2a60007aeead4', 100::numeric, 'apple fuji 100g'),  -- aji apple fuji
    ('663c786f391c7c0007959ab1', 90::numeric, 'strawberry 90g'),  -- Caplico strawberry
    ('680707ea6c6fe800079c1336', 140::numeric, 'honey cherry 140g'),  -- Aji Cherry honey
    ('67de23cb41885b0007fa6190', 170::numeric, 'sancha  170g'),  -- Aji sancha
    ('686f6c2d4c2bcf0007ef296c', 150::numeric, 'red cherry 150g'),  -- Aji Cherry Red
    ('663c78b5391c7c000795d27c', 170::numeric, 'fruit and veggies 170g'),  -- Aji Fruit And Veggies Chips Big Pack
    ('6813239f0f42360007d8e0d4', 130::numeric, 'grapefruit white bits 130g'),  -- aji white grapefruit bites
    ('681322d8c869390008e5015f', 100::numeric, 'grapefruit white slices 100g'),  -- aji white grapefruit
    ('68132405a2ca040007a34853', 130::numeric, 'grapefruit red bits 130g'),  -- aji red grapefruit bites
    ('681323341597d90007171864', 100::numeric, 'grapefruit red slices 100g'),  -- aji red grapefruit
    ('68132469e4c2a30007201c41', 120::numeric, 'tangerine grapefruit 120g'),  -- aji tangerine & grapefruit
    ('663c78ba391c7c000795d5fc', 90::numeric, 'pumpkin seeds 90g'),  -- Aji Pumpkin Seeds
    ('68fde22edd9bd70007c1f52d', 150::numeric, 'watermelon seeds 150g'),  -- Watermelon ade
    ('685e017767323f0007f0cd72', 150::numeric, 'sunflower seeds 150g'),  -- Aji chocolate sunflower seeds
    ('67397a3d51732f00075be147', 90::numeric, 'almonds 90g'),  -- Aji Almonds
    ('6734633bbd494900072b24f5', 350::numeric, 'broad beans 350g'),  -- Aji broad beans
    ('663c7894391c7c000795b7da', 100::numeric, 'mixed nuts 100g'),  -- Ganyuan Mixed Beans & Nuts
    ('6877334a8a918500078bcf5a', 280::numeric, 'singapore peanuts 280g'),  -- BF peanuts
    ('6894431057c1c300079db387', 150::numeric, 'Nutty adobo'),  -- Aji nutty adobo
    ('68944328fe458d00078bc8d0', 150::numeric, 'Naked mani'),  -- Aji naked mani
    ('66b574733f7fbe0007c9653e', 100::numeric, 'hokkaido codfish 100g'),  -- Aji codfish hokkaido
    ('663c78bb391c7c000795d696', 180::numeric, 'hokkaido squid 180g'),  -- Aji Squid Hokkaido Slices
    ('663c78b4391c7c000795d172', 100::numeric, 'jap cutlle fish 100g'),  -- Aji Cuttlefish Japanese
    ('663c78b4391c7c000795d1aa', 200::numeric, 'sweet & spicy cuttlefish 200g'),  -- Aji Cuttlefish Sweet And Spicy
    ('668f3e7a746f16000763e67a', 75::numeric, 'ezo squid 75g'),  -- Aji Ezo Squid
    ('6a278350d41a1c0007e04e9b', 100::numeric, 'stanky squid 100g'),  -- Aji stanky squid  binge pack
    ('663c78b4391c7c000795d13a', 80::numeric, 'codfish sesame 80g'),  -- Aji Codfish Sesame
    ('66b5799b0563b9000708d400', 80::numeric, 'codfish seaweed 80g'),  -- Aji codfish Seaweed
    ('66b5793ef772d0000761995f', 80::numeric, 'codfish salmon 80g'),  -- Aji codfish salmon
    ('66b5797002b6810007629ff5', 80::numeric, 'codfish wasabi 80g'),  -- Aji codfish mustard
    ('663c78b4391c7c000795d180', 50::numeric, 'cuttle fish 3s 50g'),  -- Aji Cuttlefish Roasted
    ('663c78b4391c7c000795d19c', 50::numeric, 'cuttlefish M 50g'),  -- Aji Cuttlefish Roasted M
    ('663c78bb391c7c000795d6a4', 170::numeric, 'squid rings 170g'),  -- Aji Squid Rings
    ('663c78bb391c7c000795d6ce', 70::numeric, 'spicy squid strips 70g'),  -- Aji Squid Spicy Strips
    ('663c78b4391c7c000795d1e2', 1::numeric, 'Dilis'),  -- Aji Dilis
    ('663c78b5391c7c000795d1f0', 1::numeric, 'Dilis Spicy'),  -- Aji Dilis Spicy
    ('665abff34de8e200089bf09d', 100::numeric, 'Prawn roll'),  -- Aji Prawn Roll
    ('663c78b2391c7c000795cf88', 100::numeric, 'Gummy Bear'),  -- hello aji gummy bear
    ('6a14d76eba1bae0007a28afe', 100::numeric, 'XL Gummy Worm'),  -- hello aji xl worm
    ('663c7890391c7c000795b44c', 100::numeric, 'Sour Power Orb'),  -- hello aji sour orb
    ('6a14d69aa01cb60007f03c9d', 100::numeric, 'Sour Heart'),  -- hello aji sour heart
    ('69df3596175e690007525a06', 100::numeric, 'Under The Sea'),  -- hello aji under the sea gummy
    ('6a14d81549e79c00065513d0', 100::numeric, 'Sour Platypus'),  -- hello aji sour platypus
    ('6a14d6c8ba1bae0007a28668', 100::numeric, 'Sour Popsicle'),  -- hello aji sour popsicle
    ('69df35c13a8da00007eba9f9', 100::numeric, 'Galactic Gummy'),  -- hello aji galactic gummy
    ('663c788a391c7c000795afd0', NULL::numeric, 'white rabbit original')  -- White Rabbit
) AS v(product_id, pack_weight_g, nickname)
WHERE p.id = v.product_id;


-- ---------------------------------------------------------------------------
-- 2. Verify.
--    First query should return 115.
--    Second should return ZERO rows — anything listed is a product_id missing
--    from products, so that nickname and weight never landed.
-- ---------------------------------------------------------------------------
SELECT count(*) AS products_with_nickname FROM products WHERE nickname IS NOT NULL;

SELECT v.product_id, v.nickname
FROM (VALUES
    ('663c78b8391c7c000795d43c', 130::numeric, 'kiamoy strips 130g'),  -- Aji Kiamoy Strips
    ('663c78b7391c7c000795d3cc', 100::numeric, 'Curl sour 100g'),  -- Aji Kiamoy Curl Sour
    ('663c788e391c7c000795b342', 130::numeric, 'Summer 130g'),  -- Aji Kiamoy Summer
    ('663c78b4391c7c000795d1d4', 140::numeric, 'Dikiam 140g'),  -- Aji Dikiam Sweet Taiwan
    ('6666c82fc7a0920007c45a5b', 160::numeric, 'Honey bayberry 160g'),  -- aji champoy honey bayberry
    ('663c78b9391c7c000795d58c', 95::numeric, 'okinawa 95g'),  -- Aji Plum Okinawa
    ('67a47841d847c70007fdbaa7', 180::numeric, 'Cured plum 180g'),  -- Aji cured plum
    ('663c78b8391c7c000795d474', 90::numeric, 'Emperor plum 90g'),  -- Aji Emperor Plum
    ('663c78b3391c7c000795d092', 150::numeric, 'Champoy bayberry 150g'),  -- Aji Champoy Bayberry
    ('663c78b7391c7c000795d3e8', 40::numeric, 'King seedless 40g'),  -- Aji Kiamoy King Seedless
    ('663c78b9391c7c000795d562', 160::numeric, 'Lovers plum 160g'),  -- Aji Plum Lovers
    ('6666c62c8770ef00086da39f', 150::numeric, 'K-plum  150g'),  -- aji plum - k plum
    ('672d6d617db5ce000870ca89', 180::numeric, 'Winter strips 180g'),  -- aji plum winter strips
    ('672d6df707e6ee0007143001', 150::numeric, 'Winter Singapore 150g'),  -- aji plum winter singapore
    ('672d6e56d946c90008213fda', 130::numeric, 'Winter curl 130g'),  -- aji plum winter curl
    ('663c78ba391c7c000795d60a', 120::numeric, 'Cubes 120g'),  -- Aji Red Lovers Plum Cubes
    ('672d6caa929c8900074e0bac', 130::numeric, 'Crimson leaf 130g'),  -- aji plum crimson leaf
    ('672d6ec3c13f9400077a41d4', 70::numeric, 'Square cut  70g'),  -- aji plum square cut
    ('68303605c17c20000766d42f', 60::numeric, 'Mango tango S 60'),  -- Aji plum mango tango S
    ('68303638966a3100071fe53a', 50::numeric, 'Moon blossom  S 50g'),  -- Aji plum moon blossom S
    ('672d6d1a88eca500079cefe0', 200::numeric, 'Plum snow ball A4 200g'),  -- aji plum snow ball
    ('6666c80858db9b0007e76e31', 160::numeric, 'sugar bayberry 160g'),  -- aji champoy - sugar baby bayberry
    ('6666c7b6d8fbe90008112fc0', 150::numeric, 'tangerine bayberry 150'),  -- Aji Tangerine Bayberry
    ('6666c786c7a0920007c43ab1', 150::numeric, '-ice cream plum 150g'),  -- Aji Plum Ice Cream
    ('681454f3cf78800007265bb3', 160::numeric, 'snow flakes plum A2 160g'),  -- aji snowflake plum
    ('681455dbe4c2a300073fc94b', 130::numeric, 'Mizu plum A4 130g'),  -- aji mizu plum
    ('692011154405b80007ed3da2', 140::numeric, 'Dried peach plum red'),  -- Aji Dried Peach Plum
    ('692010d3cddf3800065965ce', 140::numeric, 'Dried green plum'),  -- Aji Green Plum
    ('681322f81b6b18000721b64e', 130::numeric, 'sugar ginger A13 130g'),  -- aji sugar ginger
    ('681323e09a9f7b000722adab', 130::numeric, 'baby hellboy A14 130g'),  -- aji baby hellboy
    ('688f902ecc94ae0007e18168', 70::numeric, 'sweet okinawa 70g'),  -- aji sweet plum
    ('688f9002566c850006de0bc1', 140::numeric, 'rose champoy waxberry 140g'),  -- aji rose champoy waxberry
    ('663c78b9391c7c000795d570', 160::numeric, 'red lovers seedless A15 160g'),  -- Aji Plum Lovers Seedless
    ('6813225acf78800007078c0e', 150::numeric, 'Orchard peaches A16 150g'),  -- aji orchard peaches
    ('6813228e8d24ef00071fe03d', 130::numeric, 'salty tangerine A17 130g'),  -- aji salty tangerine
    ('6814549aebce620007a505e0', 140::numeric, 'licorice tangerine peel A18 140g'),  -- aji licorice tangerine peel
    ('681321e6cf7880000707725d', 130::numeric, 'wakayama A19 130g'),  -- aji plum wakayama
    ('6666c7df58db9b0007e76817', 180::numeric, 'evermoist  180g'),  -- Aji Plum Evermoist
    ('663c78a2391c7c000795c33a', 160::numeric, 'oolong plum 160g'),  -- Taiwan Oolong Tea Plum 160G
    ('666c088d6e8eae000705bcd9', 180::numeric, 'pickled plum 180g'),  -- Pickled Plum
    ('67a1c865e154e00007ad9a59', 150::numeric, 'blueberry plum 150g'),  -- Aji Blueberry Plum
    ('663c78b6391c7c000795d378', 75::numeric, 'Haw square 75g'),  -- Aji Haw Square
    ('6666c65c8770ef00086dabff', 150::numeric, 'Ms peaches 150g'),  -- aji peach - Ms. peaches
    ('672d6dadf1bad900074a4623', 160::numeric, 'april apricot 160g'),  -- aji april apricot
    ('672d6dceb628eb0006066e95', 200::numeric, 'amber kumquat 200g'),  -- aji amber sun kumquat
    ('663c78b8391c7c000795d4e4', 170::numeric, 'olives 170g'),  -- aji olives
    ('663c7870391c7c0007959b59', 140::numeric, 'mango 140g'),  -- Chiao-E Irwin Mango Marshmallow Biscuit
    ('663c78b8391c7c000795d490', 130::numeric, 'langka 130g'),  -- Aji Langka
    ('663c7870391c7c0007959b67', 140::numeric, 'pineapple 140g'),  -- Chiao-E Pineapple Cake
    ('663c78b6391c7c000795d340', 120::numeric, 'Guyabano 120g'),  -- Aji Guyabano
    ('663c78b8391c7c000795d4f2', 140::numeric, 'Papaya 140g'),  -- Aji Papaya
    ('663c787b391c7c000795a3d4', 80::numeric, 'Coconut 80g'),  -- Nissin Coconut Sable
    ('663c78b6391c7c000795d2fa', 120::numeric, 'guava 120g'),  -- Aji Guava
    ('663c78b6391c7c000795d308', 120::numeric, 'guava spicy 120g'),  -- Aji Guava Spicy
    ('663c78b4391c7c000795d1c6', 150::numeric, 'dates 150g'),  -- Aji Dates Glazed
    ('6814769c722d0500071a7b5d', 70::numeric, 'red dates 70g'),  -- aji red dates
    ('663c78ba391c7c000795d634', 130::numeric, 'sampaloc 130g'),  -- dont sell Aji Sampaloc
    ('663c78ba391c7c000795d642', 130::numeric, 'sampaloc spicy 130g'),  -- dont sell Aji Sampaloc Spicy
    ('677cffdd5d878a000791efbb', 40::numeric, 'freeze dried strawberry 40g'),  -- Freeze dried strawberry crisps
    ('688f910db644f90007d99c0e', 60::numeric, 'freeze dried kiwi 60g'),  -- aji freeze dried kiwi
    ('6a55f7955b607c0007ed9f3a', 90::numeric, 'freeze dried okra 90g'),  -- Miao freeze dried Okra
    ('663c78b5391c7c000795d2a6', 150::numeric, 'prune ginger 150g'),  -- Aji Ginger Prune
    ('688f8f92bf20870007a2deb8', 90::numeric, 'ruby ginger 90g'),  -- aji ruby ginger
    ('663c78b5391c7c000795d298', 150::numeric, 'lemon ginger 150g'),  -- Aji Ginger Lemon
    ('663c78b7391c7c000795d3be', 140::numeric, 'red ginger 140g'),  -- Aji Hk Red Ginger
    ('66584c91bc21e40006e4a85d', 35::numeric, 'goji berry 35g'),  -- Aji Tibet Goji Berries
    ('68c9427da83e2400077ad76f', 150::numeric, 'lemon juice ginger 150g'),  -- Aji lemon juice ginger
    ('663c78b4391c7c000795d148', 175::numeric, 'condol  175g'),  -- DO NOT SEND Aji Condol old
    ('66f675f823846000075f9398', 120::numeric, 'guava red 120g'),  -- aji guava red
    ('66f6760fdec2a60007aeead4', 100::numeric, 'apple fuji 100g'),  -- aji apple fuji
    ('663c786f391c7c0007959ab1', 90::numeric, 'strawberry 90g'),  -- Caplico strawberry
    ('680707ea6c6fe800079c1336', 140::numeric, 'honey cherry 140g'),  -- Aji Cherry honey
    ('67de23cb41885b0007fa6190', 170::numeric, 'sancha  170g'),  -- Aji sancha
    ('686f6c2d4c2bcf0007ef296c', 150::numeric, 'red cherry 150g'),  -- Aji Cherry Red
    ('663c78b5391c7c000795d27c', 170::numeric, 'fruit and veggies 170g'),  -- Aji Fruit And Veggies Chips Big Pack
    ('6813239f0f42360007d8e0d4', 130::numeric, 'grapefruit white bits 130g'),  -- aji white grapefruit bites
    ('681322d8c869390008e5015f', 100::numeric, 'grapefruit white slices 100g'),  -- aji white grapefruit
    ('68132405a2ca040007a34853', 130::numeric, 'grapefruit red bits 130g'),  -- aji red grapefruit bites
    ('681323341597d90007171864', 100::numeric, 'grapefruit red slices 100g'),  -- aji red grapefruit
    ('68132469e4c2a30007201c41', 120::numeric, 'tangerine grapefruit 120g'),  -- aji tangerine & grapefruit
    ('663c78ba391c7c000795d5fc', 90::numeric, 'pumpkin seeds 90g'),  -- Aji Pumpkin Seeds
    ('68fde22edd9bd70007c1f52d', 150::numeric, 'watermelon seeds 150g'),  -- Watermelon ade
    ('685e017767323f0007f0cd72', 150::numeric, 'sunflower seeds 150g'),  -- Aji chocolate sunflower seeds
    ('67397a3d51732f00075be147', 90::numeric, 'almonds 90g'),  -- Aji Almonds
    ('6734633bbd494900072b24f5', 350::numeric, 'broad beans 350g'),  -- Aji broad beans
    ('663c7894391c7c000795b7da', 100::numeric, 'mixed nuts 100g'),  -- Ganyuan Mixed Beans & Nuts
    ('6877334a8a918500078bcf5a', 280::numeric, 'singapore peanuts 280g'),  -- BF peanuts
    ('6894431057c1c300079db387', 150::numeric, 'Nutty adobo'),  -- Aji nutty adobo
    ('68944328fe458d00078bc8d0', 150::numeric, 'Naked mani'),  -- Aji naked mani
    ('66b574733f7fbe0007c9653e', 100::numeric, 'hokkaido codfish 100g'),  -- Aji codfish hokkaido
    ('663c78bb391c7c000795d696', 180::numeric, 'hokkaido squid 180g'),  -- Aji Squid Hokkaido Slices
    ('663c78b4391c7c000795d172', 100::numeric, 'jap cutlle fish 100g'),  -- Aji Cuttlefish Japanese
    ('663c78b4391c7c000795d1aa', 200::numeric, 'sweet & spicy cuttlefish 200g'),  -- Aji Cuttlefish Sweet And Spicy
    ('668f3e7a746f16000763e67a', 75::numeric, 'ezo squid 75g'),  -- Aji Ezo Squid
    ('6a278350d41a1c0007e04e9b', 100::numeric, 'stanky squid 100g'),  -- Aji stanky squid  binge pack
    ('663c78b4391c7c000795d13a', 80::numeric, 'codfish sesame 80g'),  -- Aji Codfish Sesame
    ('66b5799b0563b9000708d400', 80::numeric, 'codfish seaweed 80g'),  -- Aji codfish Seaweed
    ('66b5793ef772d0000761995f', 80::numeric, 'codfish salmon 80g'),  -- Aji codfish salmon
    ('66b5797002b6810007629ff5', 80::numeric, 'codfish wasabi 80g'),  -- Aji codfish mustard
    ('663c78b4391c7c000795d180', 50::numeric, 'cuttle fish 3s 50g'),  -- Aji Cuttlefish Roasted
    ('663c78b4391c7c000795d19c', 50::numeric, 'cuttlefish M 50g'),  -- Aji Cuttlefish Roasted M
    ('663c78bb391c7c000795d6a4', 170::numeric, 'squid rings 170g'),  -- Aji Squid Rings
    ('663c78bb391c7c000795d6ce', 70::numeric, 'spicy squid strips 70g'),  -- Aji Squid Spicy Strips
    ('663c78b4391c7c000795d1e2', 1::numeric, 'Dilis'),  -- Aji Dilis
    ('663c78b5391c7c000795d1f0', 1::numeric, 'Dilis Spicy'),  -- Aji Dilis Spicy
    ('665abff34de8e200089bf09d', 100::numeric, 'Prawn roll'),  -- Aji Prawn Roll
    ('663c78b2391c7c000795cf88', 100::numeric, 'Gummy Bear'),  -- hello aji gummy bear
    ('6a14d76eba1bae0007a28afe', 100::numeric, 'XL Gummy Worm'),  -- hello aji xl worm
    ('663c7890391c7c000795b44c', 100::numeric, 'Sour Power Orb'),  -- hello aji sour orb
    ('6a14d69aa01cb60007f03c9d', 100::numeric, 'Sour Heart'),  -- hello aji sour heart
    ('69df3596175e690007525a06', 100::numeric, 'Under The Sea'),  -- hello aji under the sea gummy
    ('6a14d81549e79c00065513d0', 100::numeric, 'Sour Platypus'),  -- hello aji sour platypus
    ('6a14d6c8ba1bae0007a28668', 100::numeric, 'Sour Popsicle'),  -- hello aji sour popsicle
    ('69df35c13a8da00007eba9f9', 100::numeric, 'Galactic Gummy'),  -- hello aji galactic gummy
    ('663c788a391c7c000795afd0', NULL::numeric, 'white rabbit original')  -- White Rabbit
) AS v(product_id, pack_weight_g, nickname)
LEFT JOIN products p ON p.id = v.product_id
WHERE p.id IS NULL;
