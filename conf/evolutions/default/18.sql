# --- !Ups
CREATE TABLE validation_options (
  validation_id INT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (validation_id)
);

CREATE TABLE label_validation (
  validation_id SERIAL NOT NULL,
  label_id INT NOT NULL,
  validation_result INT NOT NULL,
  user_id TEXT NOT NULL,
  mission_id INT NOT NULL,
  start_timestamp TIMESTAMP,
  end_timestamp TIMESTAMP,
  PRIMARY KEY (validation_id),
  FOREIGN KEY (label_id) REFERENCES label(label_id),
  FOREIGN KEY (validation_result) REFERENCES validation_options(validation_id),
  FOREIGN KEY (user_id) REFERENCES sidewalk.user(user_id),
  FOREIGN KEY (mission_id) REFERENCES mission(mission_id)
);

INSERT INTO validation_options (validation_id, text) VALUES (1, 'agree');
INSERT INTO validation_options (validation_id, text) VALUES (2, 'disagree');
INSERT INTO validation_options (validation_id, text) VALUES (3, 'unclear');

ALTER TABLE gsv_data
  ADD COLUMN expired BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN last_viewed TIMESTAMP;

# --- !Downs
DROP TABLE label_validation;
DROP TABLE validation_options;

ALTER TABLE gsv_data
  DROP COLUMN expired,
  DROP COLUMN last_viewed;