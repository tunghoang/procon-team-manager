-- MySQL dump 10.13  Distrib 8.0.33, for Linux (x86_64)
--
-- Host: localhost    Database: procon_manager_db
-- ------------------------------------------------------
-- Server version	8.0.33-0ubuntu0.20.04.2

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `answer`
--

DROP TABLE IF EXISTS `answer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `answer` (
  `id` int NOT NULL AUTO_INCREMENT,
  `answer_data` text,
  `score_data` text,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `match_id` int NOT NULL,
  `team_id` int NOT NULL,
  `question_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Items_unique` (`team_id`,`question_id`),
  KEY `match_id` (`match_id`),
  KEY `question_id` (`question_id`),
  CONSTRAINT `answer_ibfk_1` FOREIGN KEY (`match_id`) REFERENCES `match` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `answer_ibfk_2` FOREIGN KEY (`team_id`) REFERENCES `team` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `answer_ibfk_3` FOREIGN KEY (`question_id`) REFERENCES `question` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `answer`
--

LOCK TABLES `answer` WRITE;
/*!40000 ALTER TABLE `answer` DISABLE KEYS */;
/*!40000 ALTER TABLE `answer` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `match`
--

DROP TABLE IF EXISTS `match`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `match` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text,
  `is_active` tinyint(1) DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `round_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `match_name_round_id` (`name`,`round_id`),
  KEY `round_id` (`round_id`),
  CONSTRAINT `match_ibfk_1` FOREIGN KEY (`round_id`) REFERENCES `round` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `match`
--

LOCK TABLES `match` WRITE;
/*!40000 ALTER TABLE `match` DISABLE KEYS */;
INSERT INTO `match` VALUES (1,'Th_1_1','',0,'2023-12-05 14:18:23','2023-12-05 14:18:23',1),(2,'Th_1_2','',0,'2023-12-05 14:18:39','2023-12-05 14:18:39',1),(3,'Th_1_3','',0,'2023-12-05 14:18:45','2023-12-05 14:18:45',1),(4,'Th_1_4','',0,'2023-12-05 14:18:53','2023-12-05 14:18:53',1),(5,'Th_1_5','',0,'2023-12-05 14:19:00','2023-12-05 14:19:00',1),(6,'Th_1_6','',0,'2023-12-05 14:19:08','2023-12-05 14:19:08',1),(7,'Th_2_1','',0,'2023-12-05 14:19:27','2023-12-05 14:19:27',2),(8,'Th_2_2','',0,'2023-12-05 14:19:34','2023-12-05 14:19:34',2),(9,'Th_2_3','',0,'2023-12-05 14:19:40','2023-12-05 14:19:40',2),(10,'B_2_1','',0,'2023-12-05 14:19:49','2023-12-05 14:19:49',2),(11,'B_2_2','',0,'2023-12-05 14:19:57','2023-12-05 14:19:57',2),(12,'B_2_3','',0,'2023-12-05 14:20:08','2023-12-05 14:20:08',2),(13,'Th_3_1','',0,'2023-12-05 14:20:31','2023-12-05 14:20:31',3),(14,'Th_3_2','',0,'2023-12-05 14:20:38','2023-12-05 14:20:38',3),(15,'B_3_1','',0,'2023-12-05 14:20:49','2023-12-05 14:20:49',3),(16,'B_3_2','',0,'2023-12-05 14:20:55','2023-12-05 14:20:55',3),(17,'B_3_3','',0,'2023-12-05 14:21:01','2023-12-05 14:21:01',3),(18,'Th_4_1','',0,'2023-12-05 14:21:22','2023-12-05 14:21:22',4),(19,'B_4_1','',0,'2023-12-05 14:21:33','2023-12-05 14:21:33',4),(20,'B_4_2','',0,'2023-12-05 14:21:40','2023-12-05 14:21:40',4),(21,'B_5_1','',0,'2023-12-05 14:22:00','2023-12-05 14:22:00',5),(22,'B_5_2','',0,'2023-12-05 14:22:06','2023-12-05 14:22:06',5),(23,'B_6_1','',0,'2023-12-05 14:22:40','2023-12-05 14:22:40',6),(24,'Final_1','',0,'2023-12-05 14:23:37','2023-12-05 14:24:03',7),(25,'Final_2','',0,'2023-12-05 14:23:54','2023-12-05 14:23:54',7);
/*!40000 ALTER TABLE `match` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `question`
--

DROP TABLE IF EXISTS `question`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `question` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `start_time` datetime DEFAULT NULL,
  `end_time` datetime DEFAULT NULL,
  `question_data` text,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `match_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Items_unique` (`name`,`match_id`),
  KEY `match_id` (`match_id`),
  CONSTRAINT `question_ibfk_1` FOREIGN KEY (`match_id`) REFERENCES `match` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `question`
--

LOCK TABLES `question` WRITE;
/*!40000 ALTER TABLE `question` DISABLE KEYS */;
/*!40000 ALTER TABLE `question` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `round`
--

DROP TABLE IF EXISTS `round`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `round` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `tournament_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Items_unique` (`name`,`tournament_id`),
  KEY `tournament_id` (`tournament_id`),
  CONSTRAINT `round_ibfk_1` FOREIGN KEY (`tournament_id`) REFERENCES `tournament` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `round`
--

LOCK TABLES `round` WRITE;
/*!40000 ALTER TABLE `round` DISABLE KEYS */;
INSERT INTO `round` VALUES (1,'Vòng 1','','2023-12-05 14:03:06','2023-12-05 14:03:06',1),(2,'Vòng 2','','2023-12-05 14:03:12','2023-12-05 14:03:12',1),(3,'Vòng 3','','2023-12-05 14:03:18','2023-12-05 14:03:18',1),(4,'Vòng 4','','2023-12-05 14:03:25','2023-12-05 14:03:25',1),(5,'Vòng 5','','2023-12-05 14:03:31','2023-12-05 14:03:31',1),(6,'Vòng 6','','2023-12-05 14:03:38','2023-12-05 14:03:38',1),(7,'Chung kết','','2023-12-05 14:03:45','2023-12-05 14:23:09',1);
/*!40000 ALTER TABLE `round` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `team`
--

DROP TABLE IF EXISTS `team`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `team` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `account` varchar(255) NOT NULL,
  `password` text NOT NULL,
  `is_admin` tinyint(1) DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `account` (`account`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `team`
--

LOCK TABLES `team` WRITE;
/*!40000 ALTER TABLE `team` DISABLE KEYS */;
INSERT INTO `team` VALUES (1,'PAM','PAM','$2b$10$ywJSxk.HeydGkRchztnMTuUz58qDXnmVVoFYxkkcVjhIkeILclbwm',0,'2023-12-05 14:05:26','2023-12-05 14:06:42'),(2,'YIYA','YIYA','$2b$10$RjYH5EjEkKowF6kByQUwvuj7dA.qG5zG8UFZEJRtqnRfDWwLzw0vm',0,'2023-12-05 14:05:46','2023-12-05 14:06:32'),(3,'CTU.Word2Vec','CTU.Word2Vec','$2b$10$fyg79NcjHSlKjT8XhZr.vO0BRwiLWcJMfJT7EFt1KEdz.Xs4uQKK2',0,'2023-12-05 14:06:23','2023-12-05 14:06:23'),(4,'HCMUTE.Procon','HCMUTE.Procon','$2b$10$UIAqyw.029dQKoHpHqVyceGNNoAeW4mbUiNgfzZZBtMnb/ATSkQLO',0,'2023-12-05 14:09:22','2023-12-05 14:09:22'),(5,'BKDN.Procon','BKDN.Procon','$2b$10$9H0BttXBL.lltZ/5J2SaY.4v/nvMS/MS2KGWDjLoxttQWbIiFSmby',0,'2023-12-05 14:10:40','2023-12-05 14:10:40'),(7,'DTU_DZ_T1','DTU_DZ_T1','$2b$10$3DP22vMPWRWa/lA578a1kewyX7neqRYH.hxzYxx1xqrf/jF7R9B22',0,'2023-12-05 14:11:07','2023-12-05 14:11:07'),(8,'DTU_DZ_T2','DTU_DZ_T2','$2b$10$SMFuH7uHHDVjFR0U7fQrReEkr7uoeEoGzaZy6mOGdmGAQ1KSQdHCi',0,'2023-12-05 14:11:33','2023-12-05 14:11:33'),(9,'[HCMUE] [RETURN TRUE]','HCMUE.RETURN_TRUE','$2b$10$weaQmqKHBPXjL48mkEd5bOsIJbUTmqtTaba7mvCNVlSd9sbVOimiu',0,'2023-12-05 14:12:23','2023-12-05 14:12:23'),(10,'[HCMUE] [HOA GIAY THANH TIEN]','HCMUE.HOA_GIAY_THANH_TIEN','$2b$10$6Wf3J9Vp8hLNC79U8MPw6.u69G.PUErema911P0JMlTwOLL6eQX.q',0,'2023-12-05 14:12:56','2023-12-05 14:12:56'),(11,'[HCMUE] WIN','HCMUE_WIN','$2b$10$/vsBnMap7qCE5mpz1.rcw.lB3/DiI7N9nTYaVa6t8qW8rtKyN6HBa',0,'2023-12-05 14:15:35','2023-12-05 14:15:35'),(12,'SIU-Xedap','SIU.Xedap','$2b$10$yc2AJSKQfrhOKgHkpGkj0ujb3yZf8hzXbSS1FkMDRVsw5OTcaGDZS',0,'2023-12-05 14:16:12','2023-12-05 14:16:12'),(13,'HaUI.Meowxinh','HaUI.Meowxinh','$2b$10$MIvKKamRXrXvT1OpVzaNfOEdbjSwAlba3.trTRzC/QLZqHeA.fgBe',0,'2023-12-05 14:16:30','2023-12-05 14:16:30'),(14,'HaUI.Teammates.Destroyer','HaUI.Teammates.Destroyer','$2b$10$MS9MizYjgzbUy6EFr2rdt.AvOeq5.UA1bH9mIDroYfU45H//lf69.',0,'2023-12-05 14:16:44','2023-12-05 14:16:44');
/*!40000 ALTER TABLE `team` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `team_match`
--

DROP TABLE IF EXISTS `team_match`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `team_match` (
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `match_id` int NOT NULL,
  `team_id` int NOT NULL,
  PRIMARY KEY (`match_id`,`team_id`),
  KEY `team_id` (`team_id`),
  CONSTRAINT `team_match_ibfk_1` FOREIGN KEY (`match_id`) REFERENCES `match` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `team_match_ibfk_2` FOREIGN KEY (`team_id`) REFERENCES `team` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `team_match`
--

LOCK TABLES `team_match` WRITE;
/*!40000 ALTER TABLE `team_match` DISABLE KEYS */;
/*!40000 ALTER TABLE `team_match` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tournament`
--

DROP TABLE IF EXISTS `tournament`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tournament` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tournament`
--

LOCK TABLES `tournament` WRITE;
/*!40000 ALTER TABLE `tournament` DISABLE KEYS */;
INSERT INTO `tournament` VALUES (1,'PROCON 2023','','2023-12-05 14:02:31','2023-12-05 14:02:31');
/*!40000 ALTER TABLE `tournament` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2023-12-05 22:03:18
