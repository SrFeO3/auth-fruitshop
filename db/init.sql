CREATE TABLE IF NOT EXISTS fruit (
  id VARCHAR(10) NOT NULL,
  name VARCHAR(50),
  origin VARCHAR(50),
  price int,
  description TEXT,
  origin_latitude DECIMAL(9, 6),
  origin_longitude DECIMAL(9, 6),
  PRIMARY KEY (id)
);

-- To prevent duplicate key errors on re-running, clear the table first.
TRUNCATE TABLE fruit;

INSERT INTO fruit(id, name, origin, price, description, origin_latitude, origin_longitude) VALUES
('001', 'Fuji', 'Aomori, Japan', 300, 'The Fuji apple, a global favorite, originated in Fujisaki, Aomori, Japan, in the late 1930s. It is a crossbreed between two American apple varieties: the Red Delicious and the Virginia Ralls Genet (known as ''Kokko'' in Japan). Fuji apples are celebrated for their exceptional sweetness, crisp texture, and remarkable juiciness, making them a top choice for eating fresh. They are typically large, round, and have a distinctive reddish-pink blush over a yellow-green background. Thanks to their thick skin, they have an incredibly long shelf life.', 40.822139, 140.747894),
('002', 'Shinano Sweet', 'Nagano, Japan', 350, 'Developed in Nagano, Japan, Shinano Sweet is a cross between ''Fuji'' and ''Tsugaru''. True to its name, it boasts a high sugar content with very little acidity, offering a purely sweet taste. Its flesh is crisp and exceptionally juicy, complemented by a delightful aroma. The apple''s skin is a vibrant, uniform red, making it visually appealing. It is primarily enjoyed fresh due to its excellent eating qualities and has become a popular modern variety in Japan.', 36.648500, 138.194800),
('003', 'Tsugaru', 'Aomori, Japan', 320, 'Originating from Aomori, Japan, the Tsugaru apple is an early-season favorite. It is a cross involving ''Golden Delicious''. This variety is prized for its refreshing sweetness, balanced with a mild tartness that makes it very palatable. The flesh is notably crisp and succulent, bursting with juice. Its appearance is characterized by attractive red stripes over a yellow-green base. Tsugaru is widely consumed fresh and marks the beginning of the apple season for many.', 40.822139, 140.747894),
('004', 'Shinano Gold', 'Nagano, Japan', 280, 'Hailing from Nagano, Japan, Shinano Gold is a cross between ''Golden Delicious'' and ''Senshu''. This late-season variety is distinguished by its brilliant golden-yellow skin. It offers a sophisticated flavor profile with a perfect harmony of high sweetness and crisp acidity. The texture is remarkably firm, crunchy, and juicy, making it a delight to eat. Furthermore, Shinano Gold is renowned for its outstanding storage capabilities, retaining its quality for a long time.', 36.648500, 138.194800),
('005', 'Orin', 'Fukushima, Japan', 290, 'Orin, meaning ''King of Apples'', was developed in Fukushima, Japan, from a ''Golden Delicious'' and ''Indo'' cross. It is a large, greenish-yellow apple celebrated for its distinctive and powerful sweet aroma, often likened to pineapple or pear. Its flavor is predominantly sweet with very low acidity. The flesh is firm, dense, and juicy. Orin''s unique fragrance and taste have made it one of the most popular and recognizable apple varieties in Japan for fresh consumption.', 37.760500, 140.473300);
