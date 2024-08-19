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
) ENGINE=InnoDB AUTO_INCREMENT=80 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `match`
--

LOCK TABLES `match` WRITE;
/*!40000 ALTER TABLE `match` DISABLE KEYS */;
INSERT INTO `match` VALUES (22,'PROCON UET vs Pricon','',1,'2023-07-14 02:56:50','2023-07-14 02:57:06',8),(23,'YiYa vs CIA','',1,'2023-07-14 02:57:27','2023-07-14 02:57:27',8),(26,'PROCON UET vs YiYa','',1,'2023-07-14 03:42:19','2023-07-14 03:42:19',10),(27,'dlong','',1,'2023-07-22 14:17:55','2023-07-22 14:17:55',12),(29,'CTU Test Contest','',1,'2023-09-08 15:51:53','2023-09-08 15:51:53',14),(30,'hcmue_match','hcmue_match',1,'2023-09-09 07:00:21','2023-09-10 02:16:34',15),(32,'Test1','First test match by PTIT',0,'2023-10-18 05:02:40','2023-10-18 05:02:40',16),(33,'SIU match','',1,'2023-10-21 03:59:40','2023-10-25 09:28:21',17),(34,'Test Match 1','',1,'2023-10-23 06:57:11','2023-11-17 20:12:24',1),(35,'dtuMatch','For testing DTU',1,'2023-10-31 06:40:44','2023-11-03 01:39:09',18),(40,'Test','',1,'2023-11-12 09:35:59','2023-11-12 09:35:59',21),(43,'Sư phạm Kỹ Thuật TP.HCM','tạo ngày 16/11/2023',1,'2023-11-16 06:04:05','2023-11-16 06:04:05',23),(49,'test match','',1,'2023-11-17 23:51:36','2023-11-17 23:51:36',1),(53,'19-11-2023','19-11-2023',1,'2023-11-19 05:38:16','2023-11-19 05:38:16',28),(54,'PAM test','',1,'2023-11-20 04:33:05','2023-11-20 04:33:36',1),(55,'UTE 20/11/2023','',1,'2023-11-20 05:07:26','2023-11-20 06:25:16',29),(58,'HCMUTE','',1,'2023-11-26 16:37:16','2023-11-26 16:37:16',32),(59,'Trận 1 28/11/2023','Trận 1 28/11/2023',1,'2023-11-28 07:13:44','2023-11-28 07:13:44',33),(60,'HaUI Testing Match','',1,'2023-11-28 08:31:43','2023-11-28 08:31:43',34),(62,'Trận 1','',1,'2023-11-30 02:27:18','2023-11-30 02:27:18',35),(63,'Trận 2','',1,'2023-11-30 02:27:25','2023-11-30 02:27:33',35),(68,'Trận 1 (1/12)','',1,'2023-12-01 03:41:22','2023-12-01 03:41:22',38),(69,'Trận 2 (1/12)','',1,'2023-12-01 03:41:31','2023-12-01 03:41:38',38),(70,'Chiều 1 - Lần 2','',1,'2023-12-01 08:57:20','2023-12-01 08:57:20',39),(71,'Chiều 2 - Lần 2','',1,'2023-12-01 08:57:32','2023-12-01 08:57:32',39),(72,'Trận 1 ','',1,'2023-12-04 11:00:10','2023-12-04 11:00:10',40),(73,'Trận 2','',1,'2023-12-04 11:00:35','2023-12-04 11:00:35',40),(74,'DUT_HCMUTE_Trận 1','',1,'2023-12-04 11:46:57','2023-12-04 11:46:57',41),(75,'DUT_HCMUTE_Trận 2','',1,'2023-12-04 11:47:44','2023-12-04 11:47:44',41),(77,'Trận 1','',1,'2023-12-05 09:15:29','2023-12-05 09:15:29',43),(78,'Trận 2','',1,'2023-12-05 09:15:36','2023-12-05 09:15:36',43),(79,'YIYA_YIYA','',1,'2023-12-05 11:02:27','2023-12-05 11:02:27',44);
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
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `round`
--

LOCK TABLES `round` WRITE;
/*!40000 ALTER TABLE `round` DISABLE KEYS */;
INSERT INTO `round` VALUES (1,'Testing','','2023-06-08 08:26:04','2023-06-14 03:47:26',1),(8,'SEMI FINAL','','2023-07-07 11:19:46','2023-07-14 02:57:48',1),(10,'FINAL','','2023-07-07 11:20:00','2023-07-14 02:57:58',1),(12,'Testing','','2023-07-17 04:49:41','2023-07-17 04:49:41',2),(14,'Test','CTU Test','2023-09-08 09:22:45','2023-11-07 02:35:18',3),(15,'Test','Round Test','2023-09-09 06:58:36','2023-09-09 06:58:36',5),(16,'Test','Test Round by PTIT','2023-10-18 04:58:05','2023-10-18 04:58:05',6),(17,'test','','2023-10-19 08:58:41','2023-10-19 08:58:41',7),(18,'vong1','For test','2023-10-31 06:39:11','2023-10-31 06:39:11',8),(21,'Test','','2023-11-12 09:21:22','2023-11-12 09:21:22',9),(23,'Round 1','Tạo ngày 16/11/2023','2023-11-16 05:59:51','2023-11-16 05:59:51',12),(25,'round 2','','2023-11-16 13:16:31','2023-11-16 13:16:31',12),(28,'19-11-2023','19-11-2023','2023-11-19 05:38:07','2023-11-19 05:38:07',13),(29,'UTE 20/11/2023','','2023-11-20 05:04:16','2023-11-20 05:04:16',12),(31,'21/11/2023','','2023-11-21 13:06:59','2023-11-21 13:06:59',12),(32,'26/11','','2023-11-26 16:32:52','2023-11-26 16:32:52',12),(33,'TEST ROUND 28/11/2023','TEST ROUND 28/11/2023','2023-11-28 07:12:53','2023-11-28 07:12:53',13),(34,'HaUI Test API','','2023-11-28 08:17:41','2023-11-28 08:31:08',2),(35,'Test_30_11','','2023-11-30 02:22:57','2023-11-30 02:22:57',13),(38,'Test_1_12','','2023-12-01 03:40:16','2023-12-01 03:40:16',13),(39,'Test_1_12_Lần 2','','2023-12-01 08:56:57','2023-12-01 08:56:57',13),(40,'Test_04_12','','2023-12-04 10:59:58','2023-12-04 10:59:58',13),(41,'DUT_HCMUTE','','2023-12-04 11:46:32','2023-12-04 11:46:32',13),(43,'DUT_HCMUTE_5_12','','2023-12-05 09:15:18','2023-12-05 09:15:18',13),(44,'ROUND 1','hihi','2023-12-05 10:59:06','2023-12-05 10:59:06',16);
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
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `team`
--

LOCK TABLES `team` WRITE;
/*!40000 ALTER TABLE `team` DISABLE KEYS */;
INSERT INTO `team` VALUES (19,'YiYa','YiYa','$2b$10$i3hyB4xiwz28RBKfYd1pmOueD/IYFCxEaZJBqI49IYckV.5tccs8C',0,'2023-07-11 09:41:18','2023-10-23 06:58:08'),(20,'2B1M','2B1M','$2b$10$tmQ4C.fL0fWe1iLuMCQ2NeruItpD9AdsjsMHCff1/jHHpnI55SApe',0,'2023-07-11 09:41:37','2023-07-14 01:54:51'),(21,'robot','robot','$2b$10$CIgl2GA25NEHI14bWJDIYOAqH5CECn4cGKjqEyastnE2WH2OluTli',0,'2023-07-11 09:41:52','2023-07-14 01:53:54'),(22,'Pricon','Pricon','$2b$10$eVfWpjqNYWKitcdwMbuDQOlr2dzoryY0DocohTAwHZ0M0SEdqMcbG',0,'2023-07-11 09:42:06','2023-07-14 01:54:23'),(23,'CIA','CIA','$2b$10$D.qqRIyYFjPcfMPSRGb2Y.UZWxxqGYJyIPfE3fhv7uiqJWCiupJGW',0,'2023-07-11 09:42:20','2023-07-11 09:42:20'),(24,'PROCON UET','PROCON_UET','$2b$10$MhQc5rr3.oEVJ9sKQSCp3.b3ZKJ7nvpAJAlcdPsFWquZNsa7FcLVi',0,'2023-07-11 09:43:25','2023-07-14 01:52:09'),(25,'Haui Admin','hauiadmin','$2b$10$9QTGq5n.MsT/vUPyZlG31e1sLzYvyh/OgSOtwitqSZN2hNVa1ZO3y',1,'2023-07-17 04:50:41','2023-11-24 17:07:39'),(26,'CTU Admin','ctuadmin','$2b$10$EWsKAQHR5sHN5N0NEFNOnuA8ju/8xh58OAvYuSiFXLAigmEaj6XKO',1,'2023-09-08 06:33:44','2023-09-08 06:34:04'),(27,'HCMUE Admin','hcmueadmin','$2b$10$tkrdFSCNw7COqkbCy.eMTu2X49fUktKlcOEH3FHYJGPWy0SnZtvD2',1,'2023-09-08 06:43:34','2023-09-08 06:54:51'),(28,'hcmue1','hcmue1','$2b$10$gL.xKd9YaqH7cA48Vl7QTe7IB5GA7MknyGvi3lXKIzUESHC7.X1Aq',0,'2023-09-09 06:59:23','2023-09-09 06:59:23'),(29,'hcmue2','hcmue2','$2b$10$aiQh8Uvr8qOXq93p8Rm0HOQJ4zsAWZxGJdBtXm..e9.kqcB3Nz6Ji',0,'2023-09-09 06:59:33','2023-09-09 06:59:33'),(30,'CTU 1','ctu1','$2b$10$bH/5oVXqLdIbfSgQ7SvgsuEPvK2euNPPlWtnqSSkZelCE/DmeNx5q',0,'2023-09-09 07:55:03','2023-11-07 04:23:27'),(32,'PTIT Admin','ptitadmin','$2b$10$0Z9Qff4C03IPPCBh8lueYu0t8O7.igPV1Sc0ZqIlSPycZonjy9gMa',1,'2023-10-18 04:12:37','2023-10-18 04:12:37'),(33,'ptit1','ptit1','$2b$10$wvdlnW9eatWTza7CBGe/Ie21ft29QA7IRwq.Bi18wy/ehVnUdfDI6',0,'2023-10-18 05:00:38','2023-10-18 05:00:38'),(34,'ptit2','ptit2','$2b$10$tQBSgqt5l36v6.MkEF7UR.pzK.MMXf7l0X9azMzM2KmTb4Mojk052',0,'2023-10-18 05:00:57','2023-10-18 05:00:57'),(35,'SIU1','siuadmin','$2b$10$7OrN4f82kXRUKVBPIgasZOCuKYj.gur3d.n33eSQFvBOdW8HRE086',1,'2023-10-19 08:41:25','2023-10-25 09:33:30'),(36,'SIU2','siuuu','$2b$10$KOeLImTc61bJF6fcrFVVyu1GrCLoe.2yZmd1376TvpOx1kITHKqC6',0,'2023-10-21 03:58:51','2023-10-25 09:33:48'),(37,'UET Admin','uetadmin','$2b$10$3hFA0YyaEUcelv3ods0lqe3pmZLxp9hsOUQdh0RZi4HScu1OjdL9i',1,'2023-10-23 06:33:55','2023-10-23 06:33:55'),(38,'YiYaE','YiYaE','$2b$10$tMaynHyaMLwKACxvFeRzROsAkqF/o0Zb8SPAy4t.QCadys0w4OVyq',0,'2023-10-23 06:58:50','2023-10-23 06:58:50'),(39,'DTU Admin','dtuadmin','$2b$10$.YG2/rbVo4qS8hlO057Jku2SQLtA5aFwem9G20qPTNBmzNRUemwxC',1,'2023-10-27 11:58:00','2023-10-27 11:58:00'),(40,'HUST Admin','hustadmin','$2b$10$vnVd/V0MuUw84sgj/a9cKOQ2AKDtk6Z6cmUmNvI5Xuf6rvWwPrbqO',1,'2023-10-30 08:17:58','2023-10-30 08:17:58'),(41,'dtu1','dtu1','$2b$10$MQAH9boxcAPuQWT5xcpqfOKuw.01DJdoDxxWw1X5MUJ33QfC0Top.',0,'2023-10-31 06:39:37','2023-10-31 06:46:43'),(42,'dtu2','dtu2','$2b$10$kBhuib1LxkhZz0GVBFzVae5F0oyEoU.tTwOCwiSo7oB6aup6pjOba',0,'2023-10-31 06:40:08','2023-10-31 06:46:55'),(43,'DUT Admin','dutadmin','$2b$10$w0rYmL/8WBW5uqHFBsfy/.dpkgI/xkvTL9rVk33Non91Yu6hkjQ5i',1,'2023-11-08 03:06:49','2023-11-08 03:06:49'),(48,'DUT2','dut2','$2b$10$la1IopPuCrsvyv/UW/W31Okq/7ixdxDueFFaVr3eX2GujjPBa4FAS',0,'2023-11-08 08:11:43','2023-11-08 08:11:43'),(49,'DUT1','dut1','$2b$10$KW8SiKDgCNrdO0pOO7cDEOxKpOkS3g9r3BZbEVajGhCn3LBoHc6rK',0,'2023-11-14 13:39:35','2023-11-14 13:39:35'),(50,'HCMUTE Admin','hcmuteadmin','$2b$10$/CRREyhnJmS12iErl9rHeOIETLZ88YVfwSDItfnupjx8rn/5vfFE2',1,'2023-11-14 14:28:51','2023-11-14 14:28:51'),(52,'HCMUTE _ PROCON2023','hcmute2023','$2b$10$KzxQ.g.DXEV2CBVSgynPIOXwD1YTjSWU9WX.gj9.ll7DF0Z.i/2Yq',0,'2023-11-16 06:01:12','2023-11-16 06:01:12'),(54,'hcmute_2023','hcmute_2023','$2b$10$DSlSIYDfNYUk1phkJTggUexhzZDUxzwurpHGs.eEATLEu.H0hgu4q',0,'2023-11-16 13:25:55','2023-11-16 13:25:55'),(55,'uet1','u1','$2b$10$b2Q5VWt/kY.vul0jojDdAOVXka754HLh9KCMHAErnT3ywyPquxr4u',0,'2023-11-16 18:04:00','2023-11-20 16:56:54'),(56,'uet2','u2','$2b$10$LDQkZqKF0oy0OMZBeBdzqOEQPOsufGarSKE9H1DNTNVlye/9Lh3MK',0,'2023-11-16 18:04:29','2023-11-20 16:57:06'),(60,'team1','team1','$2b$10$qyxar4dkZ1QAV.hMqOqAxuxx8.gH.bAWpJArqI7.65Icc1gSREjy6',0,'2023-11-17 23:51:08','2023-11-17 23:51:08'),(61,'team2','team2','$2b$10$DN/rabSCGYaOztj0OnA9JOlfwLVKMMU8Wmj9Ox4G7tsWuCu22zNwa',0,'2023-11-17 23:51:21','2023-11-17 23:51:21'),(62,'Cuong','TuilaCuong','$2b$10$l24TyOf8G01KUwOcIVguSOwawE.R.E5Nfj4h7tVrZl5HCd6aOh6IO',0,'2023-11-20 05:04:50','2023-11-20 05:04:50'),(63,'cuong2','tuilacuong2','$2b$10$eU0xjO9Xlg8QBuxI5rZAb.iC4YuF9hvkKt3vrRkR9EJvQrbm7q6Z6',0,'2023-11-20 05:05:12','2023-11-20 05:05:12'),(64,'HCMUTE ','213','$2b$10$oamV5YwtLD38AS7m0t3uWeUETCPpuTgEstPInutG4FXwMkIIRjhSO',0,'2023-11-26 16:36:26','2023-11-26 16:36:26'),(65,'HaUI_Meowxinh','meowxinh','$2b$10$ryIV81cpgu7MPbbIWy/cD.00hVJ7bPpsrBcI3aZ/IPEASt8eJOvEa',0,'2023-11-28 08:19:02','2023-11-28 08:20:58'),(66,'HaUI_Teammate Destroyer','haui_2','$2b$10$weSR6yowAbiyJULNqKzuLO2c23502gIeEAlOfmTtx55sgzkDQ3/jG',0,'2023-11-28 08:20:28','2023-11-28 08:21:09');
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
INSERT INTO `team_match` VALUES ('2023-07-14 02:58:19','2023-07-14 02:58:19',22,22),('2023-07-14 02:58:13','2023-07-14 02:58:13',22,24),('2023-07-14 02:58:27','2023-07-14 02:58:27',23,19),('2023-07-14 02:58:32','2023-07-14 02:58:32',23,23),('2023-07-14 03:43:08','2023-07-14 03:43:08',26,19),('2023-07-14 03:43:02','2023-07-14 03:43:02',26,24),('2023-07-22 14:18:02','2023-07-22 14:18:02',27,19),('2023-07-22 14:18:16','2023-07-22 14:18:16',27,22),('2023-11-07 03:37:32','2023-11-07 03:37:32',29,26),('2023-11-07 04:21:51','2023-11-07 04:21:51',29,30),('2023-09-09 07:01:00','2023-09-09 07:01:00',30,28),('2023-09-09 07:01:04','2023-09-09 07:01:04',30,29),('2023-10-18 05:02:54','2023-10-18 05:02:54',32,33),('2023-10-18 05:03:01','2023-10-18 05:03:01',32,34),('2023-10-21 04:00:07','2023-10-21 04:00:07',33,35),('2023-10-21 03:59:58','2023-10-21 03:59:58',33,36),('2023-10-23 06:57:29','2023-10-23 06:57:29',34,19),('2023-10-23 06:59:08','2023-10-23 06:59:08',34,38),('2023-10-31 06:41:11','2023-10-31 06:41:11',35,41),('2023-10-31 06:41:19','2023-10-31 06:41:19',35,42),('2023-11-16 13:23:38','2023-11-16 13:23:38',43,52),('2023-11-16 13:26:17','2023-11-16 13:26:17',43,54),('2023-11-17 23:51:45','2023-11-17 23:51:45',49,60),('2023-11-17 23:51:50','2023-11-17 23:51:50',49,61),('2023-11-19 05:38:33','2023-11-19 05:38:33',53,48),('2023-11-19 05:38:29','2023-11-19 05:38:29',53,49),('2023-11-20 04:33:22','2023-11-20 04:33:22',54,55),('2023-11-20 04:33:32','2023-11-20 04:33:32',54,56),('2023-11-20 05:08:27','2023-11-20 05:08:27',55,62),('2023-11-20 05:08:34','2023-11-20 05:08:34',55,63),('2023-11-26 16:37:33','2023-11-26 16:37:33',58,52),('2023-11-26 17:45:26','2023-11-26 17:45:26',58,62),('2023-11-28 07:13:58','2023-11-28 07:13:58',59,48),('2023-11-28 07:13:53','2023-11-28 07:13:53',59,49),('2023-11-28 08:32:04','2023-11-28 08:32:04',60,65),('2023-11-28 08:32:09','2023-11-28 08:32:09',60,66),('2023-11-30 02:27:58','2023-11-30 02:27:58',62,42),('2023-11-30 02:27:47','2023-11-30 02:27:47',62,49),('2023-11-30 02:28:33','2023-11-30 02:28:33',63,48),('2023-11-30 02:28:18','2023-11-30 02:28:18',63,49),('2023-12-01 03:43:43','2023-12-01 03:43:43',68,48),('2023-12-01 03:43:36','2023-12-01 03:43:36',68,49),('2023-12-01 03:43:25','2023-12-01 03:43:25',69,48),('2023-12-01 03:43:18','2023-12-01 03:43:18',69,49),('2023-12-01 08:57:59','2023-12-01 08:57:59',70,48),('2023-12-01 08:57:47','2023-12-01 08:57:47',70,49),('2023-12-01 08:58:16','2023-12-01 08:58:16',71,48),('2023-12-01 08:58:09','2023-12-01 08:58:09',71,49),('2023-12-04 11:00:25','2023-12-04 11:00:25',72,48),('2023-12-04 11:00:19','2023-12-04 11:00:19',72,49),('2023-12-04 11:00:50','2023-12-04 11:00:50',73,48),('2023-12-04 11:00:43','2023-12-04 11:00:43',73,49),('2023-12-04 11:47:07','2023-12-04 11:47:07',74,49),('2023-12-04 11:50:46','2023-12-04 11:50:46',74,62),('2023-12-04 11:47:51','2023-12-04 11:47:51',75,49),('2023-12-04 11:50:57','2023-12-04 11:50:57',75,62),('2023-12-05 09:15:43','2023-12-05 09:15:43',77,49),('2023-12-05 09:15:49','2023-12-05 09:15:49',77,62),('2023-12-05 09:15:57','2023-12-05 09:15:57',78,49),('2023-12-05 09:16:05','2023-12-05 09:16:05',78,62),('2023-12-05 11:02:46','2023-12-05 11:02:46',79,19),('2023-12-05 11:02:54','2023-12-05 11:02:54',79,38);
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
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tournament`
--

LOCK TABLES `tournament` WRITE;
/*!40000 ALTER TABLE `tournament` DISABLE KEYS */;
INSERT INTO `tournament` VALUES (1,'UET Procon 2023','Đại học Công Nghệ - ĐHQGHN','2023-06-08 08:25:55','2023-09-07 16:30:06'),(2,'FIT-HaUI','Đại học Công Nghiệp Hà Nội','2023-07-17 04:49:17','2023-07-24 01:41:33'),(3,'CTU','Đại học Cần Thơ','2023-09-08 06:31:45','2023-09-08 06:31:45'),(5,'HCMUE','Đại học Sư Phạm TP.HCM','2023-09-09 06:57:24','2023-09-09 06:57:24'),(6,'PTIT','Học viện Công nghệ Bưu chính Viễn thông','2023-10-18 04:11:45','2023-10-18 04:11:45'),(7,'SIU','Đại học Quốc tế Sài Gòn','2023-10-19 08:44:43','2023-10-19 08:44:43'),(8,'DTU','Đại học Duy Tân Đà Nẵng','2023-10-27 11:56:31','2023-10-27 11:57:17'),(9,'HUST','Đại học Bách Khoa Hà Nội','2023-10-30 08:17:26','2023-10-30 08:17:26'),(12,'HCMUTE','Đại học Sư phạm Kỹ thuật TP.HCM','2023-11-16 05:59:34','2023-11-16 05:59:34'),(13,'DUT','Đại học Bách khoa Đà Nẵng','2023-11-19 05:38:02','2023-11-19 05:38:02'),(16,'YIYA_YIYA','','2023-12-05 10:58:53','2023-12-05 10:58:53');
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

-- Dump completed on 2023-12-05 20:51:08
