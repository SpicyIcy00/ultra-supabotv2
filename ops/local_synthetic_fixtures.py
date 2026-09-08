"""Small deterministic fixtures for local PostgreSQL integration tests.

Names and figures are synthetic. Store IDs match metrics.yaml only so vetted
scope resolution works; no row or value was copied from production.
"""
from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import JSONB


def seed(conn):
    stores = [
        ('6639efd54694700008d7ccc6', '(1) Aji Ichiban Food Products', 'Rockwell'),
        ('668023c94721460006092609', '(2) Aji Ichiban food products SM Fairview', 'Fairview'),
        ('668a43f60fa9990007cfa158', '(3) Ajiichiban Food Products Greenhills', 'Greenhills'),
        ('66cfff31aa7adf0007c9de41', '(4) Ajiichiban Food Products SM North Edsa', 'North Edsa'),
        ('67612230a740d90007464e26', '(5) Ajiichiban food products Magnolia', 'Magnolia'),
        ('68c5bb269da1d500073690c2', '(6) Aji Ichiban  OPUS', 'OPUS'),
        ('69c73fcb277aa600076dfaaa', 'Ajiichiban SHANG', 'Shang'),
        ('667bde393126e50006c8058c', 'AJI BARN', 'AJI BARN'),
    ]
    conn.execute(text("""INSERT INTO stores (id,name,display_name,is_active)
                           VALUES (:id,:name,:display,true)"""),
                 [{'id': i, 'name': n, 'display': d} for i, n, d in stores])
    products = [
        {'id': 'fixture-product-00000001', 'name': 'Synthetic Mango Candy',
         'sku': 'FIX-MANGO', 'category': 'Candy', 'unit_price': 100, 'cost': 50},
        {'id': 'fixture-product-00000002', 'name': 'Synthetic Plum Candy',
         'sku': 'FIX-PLUM', 'category': 'Candy', 'unit_price': 80, 'cost': 40},
    ]
    conn.execute(text("""INSERT INTO products
        (id,name,sku,category,unit_price,cost,track_stock_level,is_parent_product)
        VALUES (:id,:name,:sku,:category,:unit_price,:cost,true,false)"""), products)
    transactions = []
    items = []
    item_id = 1
    # Closed, deterministic August windows plus prior-period evidence.
    for store_index, (store_id, _, _) in enumerate(stores[:7], start=1):
        for day, amount in ((5, 100 + store_index * 10), (12, 120 + store_index * 10),
                            (19, 140 + store_index * 10), (26, 160 + store_index * 10)):
            ref = f'fixture-{store_index}-{day}'
            transactions.append({'ref': ref, 'store': store_id,
                                 'at': f'2026-08-{day:02d} 12:00:00+08',
                                 'total': amount})
            items.append({'id': item_id, 'ref': ref,
                          'product': products[item_id % 2]['id'], 'amount': amount})
            item_id += 1
        ref = f'fixture-prior-{store_index}'
        transactions.append({'ref': ref, 'store': store_id,
                             'at': '2026-07-15 12:00:00+08', 'total': 90 + store_index})
        items.append({'id': item_id, 'ref': ref,
                      'product': products[item_id % 2]['id'], 'amount': 90 + store_index})
        item_id += 1
    conn.execute(text("""INSERT INTO new_transactions
        (ref_id,store_id,transaction_type,transaction_time,total,sub_total,is_cancelled)
        VALUES (:ref,:store,'Sale',:at,:total,:total,false)"""), transactions)
    conn.execute(text("""INSERT INTO new_transaction_items
        (id,transaction_ref_id,product_id,quantity,unit_price,item_total,item_subtotal)
        VALUES (:id,:ref,:product,1,:amount,:amount,:amount)"""), items)
    conn.execute(text("""INSERT INTO inventory
        (product_id,store_id,quantity_on_hand,warning_stock,ideal_stock)
        SELECT p.id,s.id,25,5,40 FROM products p CROSS JOIN stores s"""))
    conn.execute(text("""INSERT INTO inventory_snapshots
        (product_id,store_id,snapshot_date,quantity_on_hand)
        SELECT p.id,s.id,DATE '2026-08-31',20 FROM products p CROSS JOIN stores s"""))

    conversations = [
        {'id': '10000000-0000-0000-0000-000000000001', 'user': 'fixture-alice',
         'q': 'Synthetic fixture question one'},
        {'id': '10000000-0000-0000-0000-000000000002', 'user': 'fixture-bob',
         'q': 'Synthetic fixture question two'},
    ]
    conn.execute(text("""INSERT INTO george.conversations
        (id,thread_id,user_id,asked_at,question,status,notice_forced)
        VALUES (:id,:id,:user,now(),:q,'complete',false)"""), conversations)
    calls = [{'tool': 'get_sales', 'arguments': {'metric': 'net_sales',
              'group_by': 'store', 'date_range': ['2026-08-01', '2026-09-01']}}]
    pins = [
        {'id': '20000000-0000-0000-0000-000000000001', 'owner': 'fixture-alice',
         'title': 'Alice newest', 'conversation': conversations[0]['id'], 'page': 'Shared title'},
        {'id': '20000000-0000-0000-0000-000000000002', 'owner': 'fixture-alice',
         'title': 'Alice oldest', 'conversation': conversations[0]['id'], 'page': 'Shared title'},
        {'id': '20000000-0000-0000-0000-000000000003', 'owner': 'fixture-bob',
         'title': 'Bob page', 'conversation': conversations[1]['id'], 'page': 'Shared title'},
        {'id': '20000000-0000-0000-0000-000000000004', 'owner': 'fixture-alice',
         'title': 'Alice ungrouped', 'conversation': conversations[0]['id'], 'page': None},
    ]
    pin_insert = text("""INSERT INTO george.pins
        (id,created_by,created_at,title,question,conversation_id,page,tool_calls)
        VALUES (:id,:owner,
          CASE WHEN :title='Alice oldest' THEN now()-interval '1 day' ELSE now() END,
          :title,'Synthetic pin',:conversation,:page,:calls)""").bindparams(
              bindparam('calls', type_=JSONB))
    conn.execute(pin_insert, [{**p, 'calls': calls} for p in pins])
    call_insert = text("""INSERT INTO george.tool_calls
        (id,conversation_id,seq,tool,arguments,row_count,truncated,source_table,duration_ms,logged_at)
        VALUES (gen_random_uuid(),:conversation,0,'get_sales',:arguments,1,false,
                'new_transactions',1,now())""").bindparams(
                    bindparam('arguments', type_=JSONB))
    conn.execute(call_insert,
                 [{'conversation': c['id'], 'arguments': calls[0]['arguments']}
                  for c in conversations])
